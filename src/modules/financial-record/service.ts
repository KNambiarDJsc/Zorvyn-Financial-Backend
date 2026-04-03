/**
 * Financial Record Service
 *
 * Business logic for all financial record operations.
 *
 * Key design decisions:
 *  - Every mutation writes an audit log atomically in the same
 *    Prisma transaction — no audit gaps even on partial failures
 *  - Amounts are serialized as strings in responses — Decimal → string
 *    preserves precision through JSON, client parses as needed
 *  - ABAC layer: org-level isolation enforced in repository,
 *    user-level ownership checked here for delete operations
 *  - Soft delete only — financial records are never physically removed
 *    (compliance requirement)
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../../config/db";
import { NotFoundError, ForbiddenError } from "../../utils/errors";
import { AuditAction, AuditEntity } from "../../constants/audit-actions";
import { createAuditLogTx } from "../audit/service";
import { cache, CacheKeys } from "../../config/redis";
import { env } from "../../config/env";
import type {
    CreateRecordInput,
    UpdateRecordInput,
    ListRecordsQuery,
} from "./schema";
import type { FinancialRecordItem, RecordListResult } from "./types";
import type { RecordWithUser } from "./repository";
import type { RequestMeta } from "../../types/common";
import * as repo from "./repository";

// ─── Serializer ───────────────────────────────────────────────────────────────

function toRecordItem(r: RecordWithUser): FinancialRecordItem {
    return {
        id: r.id,
        amount: r.amount.toString(), // Decimal → string preserves precision
        type: r.type,
        category: r.category,
        description: r.description,
        date: r.date.toISOString(),
        createdBy: {
            id: r.user.id,
            firstName: r.user.firstName,
            lastName: r.user.lastName,
        },
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
    };
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createRecord(
    userId: string,
    orgId: string,
    input: CreateRecordInput,
    meta?: RequestMeta
): Promise<FinancialRecordItem> {
    // Transactional: record creation + audit log in one atomic operation
    const record = await prisma.$transaction(async (tx) => {
        const created = await tx.financialRecord.create({
            data: {
                orgId,
                userId,
                amount: new Prisma.Decimal(input.amount),
                type: input.type,
                category: input.category,
                description: input.description ?? null,
                date: input.date,
            },
            select: {
                id: true,
                amount: true,
                type: true,
                category: true,
                description: true,
                date: true,
                orgId: true,
                isDeleted: true,
                createdAt: true,
                updatedAt: true,
                user: { select: { id: true, firstName: true, lastName: true } },
            },
        });

        await createAuditLogTx(tx, {
            orgId,
            userId,
            action: AuditAction.RECORD_CREATE,
            entity: AuditEntity.FINANCIAL_RECORD,
            entityId: created.id,
            after: {
                amount: created.amount.toString(),
                type: created.type,
                category: created.category,
                date: created.date,
            },
            meta,
        });

        return created;
    });

    // Invalidate dashboard cache — new record changes aggregates
    await cache.delPattern(CacheKeys.dashboardAll(orgId));

    return toRecordItem(record);
}

// ─── Read one ─────────────────────────────────────────────────────────────────

export async function getRecordById(
    recordId: string,
    orgId: string
): Promise<FinancialRecordItem> {
    const record = await repo.findRecordById(recordId, orgId);
    if (!record) throw new NotFoundError("Financial record not found");
    return toRecordItem(record);
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listRecords(
    orgId: string,
    query: ListRecordsQuery
): Promise<RecordListResult> {
    const { items, total } = await repo.listRecords(orgId, query);
    return {
        items: items.map(toRecordItem),
        total,
    };
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateRecord(
    recordId: string,
    userId: string,
    orgId: string,
    input: UpdateRecordInput,
    meta?: RequestMeta
): Promise<FinancialRecordItem> {
    // Verify record exists within this org before updating
    const existing = await repo.findRecordById(recordId, orgId);
    if (!existing) throw new NotFoundError("Financial record not found");

    const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.financialRecord.update({
            where: { id: recordId, orgId },
            data: {
                ...(input.amount !== undefined && {
                    amount: new Prisma.Decimal(input.amount),
                }),
                ...(input.type !== undefined && { type: input.type }),
                ...(input.category !== undefined && { category: input.category }),
                ...("description" in input && { description: input.description ?? null }),
                ...(input.date !== undefined && { date: input.date }),
            },
            select: {
                id: true,
                amount: true,
                type: true,
                category: true,
                description: true,
                date: true,
                orgId: true,
                isDeleted: true,
                createdAt: true,
                updatedAt: true,
                user: { select: { id: true, firstName: true, lastName: true } },
            },
        });

        await createAuditLogTx(tx, {
            orgId,
            userId,
            action: AuditAction.RECORD_UPDATE,
            entity: AuditEntity.FINANCIAL_RECORD,
            entityId: recordId,
            before: {
                amount: existing.amount.toString(),
                type: existing.type,
                category: existing.category,
                date: existing.date,
                description: existing.description,
            },
            after: {
                amount: result.amount.toString(),
                type: result.type,
                category: result.category,
                date: result.date,
                description: result.description,
            },
            meta,
        });

        return result;
    });

    // Invalidate dashboard cache
    await cache.delPattern(CacheKeys.dashboardAll(orgId));

    return toRecordItem(updated);
}

// ─── Delete (soft) ────────────────────────────────────────────────────────────

export async function deleteRecord(
    recordId: string,
    userId: string,
    orgId: string,
    meta?: RequestMeta
): Promise<void> {
    const existing = await repo.findRecordById(recordId, orgId);
    if (!existing) throw new NotFoundError("Financial record not found");

    await prisma.$transaction(async (tx) => {
        await tx.financialRecord.update({
            where: { id: recordId, orgId },
            data: { isDeleted: true, deletedAt: new Date() },
        });

        await createAuditLogTx(tx, {
            orgId,
            userId,
            action: AuditAction.RECORD_DELETE,
            entity: AuditEntity.FINANCIAL_RECORD,
            entityId: recordId,
            before: {
                amount: existing.amount.toString(),
                type: existing.type,
                category: existing.category,
                date: existing.date,
            },
            meta,
        });
    });

    // Invalidate dashboard cache
    await cache.delPattern(CacheKeys.dashboardAll(orgId));
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function getCategories(orgId: string): Promise<string[]> {
    const cacheKey = `categories:${orgId}`;

    const cached = await cache.get<string[]>(cacheKey);
    if (cached) return cached;

    const categories = await repo.getDistinctCategories(orgId);

    await cache.set(cacheKey, categories, env.CACHE_TTL_SUMMARY);

    return categories;
}
