/**
 * Financial Record Repository
 *
 * All database access for financial records.
 * Every single query is filtered by orgId — multi-tenant isolation
 * is enforced structurally, not by convention.
 *
 * Key decisions:
 *  - Soft delete: isDeleted flag — rows are never physically removed
 *  - Compound indexes on (orgId, date), (orgId, type), (orgId, category)
 *    match the exact filter combinations used in listRecords()
 *  - Amount stored as Decimal — safe for financial arithmetic
 */

import { Prisma, RecordType } from "@prisma/client";
import { prisma } from "../../config/db";
import type { CreateRecordInput, UpdateRecordInput, ListRecordsQuery } from "./schema";
import type { PaginatedResult } from "../../types/common";

// ─── Select shape ─────────────────────────────────────────────────────────────

const recordSelect = {
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
  user: {
    select: { id: true, firstName: true, lastName: true },
  },
} satisfies Prisma.FinancialRecordSelect;

export type RecordWithUser = Prisma.FinancialRecordGetPayload<{
  select: typeof recordSelect;
}>;

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createRecord(
  orgId: string,
  userId: string,
  input: CreateRecordInput
): Promise<RecordWithUser> {
  return prisma.financialRecord.create({
    data: {
      orgId,
      userId,
      amount: new Prisma.Decimal(input.amount),
      type: input.type,
      category: input.category,
      description: input.description ?? null,
      date: input.date,
    },
    select: recordSelect,
  });
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function findRecordById(
  recordId: string,
  orgId: string
): Promise<RecordWithUser | null> {
  return prisma.financialRecord.findFirst({
    where: {
      id: recordId,
      orgId,            // tenant boundary — cannot access another org's records
      isDeleted: false,
    },
    select: recordSelect,
  });
}

export async function listRecords(
  orgId: string,
  query: ListRecordsQuery
): Promise<PaginatedResult<RecordWithUser>> {
  const {
    page, limit,
    type, category,
    startDate, endDate,
    minAmount, maxAmount,
    sortBy, sortOrder,
  } = query;

  const offset = (page - 1) * limit;

  // Build where — all scoped to orgId, excludes soft-deleted rows
  const where: Prisma.FinancialRecordWhereInput = {
    orgId,
    isDeleted: false,
    ...(type && { type }),
    ...(category && { category }),
    ...(startDate || endDate
      ? { date: { gte: startDate, lte: endDate } }
      : {}),
    ...(minAmount !== undefined || maxAmount !== undefined
      ? {
          amount: {
            ...(minAmount !== undefined && { gte: new Prisma.Decimal(minAmount) }),
            ...(maxAmount !== undefined && { lte: new Prisma.Decimal(maxAmount) }),
          },
        }
      : {}),
  };

  // count + data in parallel — single round trip
  const [total, items] = await Promise.all([
    prisma.financialRecord.count({ where }),
    prisma.financialRecord.findMany({
      where,
      select: recordSelect,
      orderBy: { [sortBy]: sortOrder },
      skip: offset,
      take: limit,
    }),
  ]);

  return { items, total };
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateRecord(
  recordId: string,
  orgId: string,
  input: UpdateRecordInput
): Promise<RecordWithUser> {
  return prisma.financialRecord.update({
    where: { id: recordId, orgId },
    data: {
      ...(input.amount !== undefined && {
        amount: new Prisma.Decimal(input.amount),
      }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.category !== undefined && { category: input.category }),
      // Allow explicitly setting description to null
      ...("description" in input && { description: input.description ?? null }),
      ...(input.date !== undefined && { date: input.date }),
    },
    select: recordSelect,
  });
}

// ─── Soft Delete ──────────────────────────────────────────────────────────────

export async function softDeleteRecord(
  recordId: string,
  orgId: string
): Promise<RecordWithUser> {
  return prisma.financialRecord.update({
    where: { id: recordId, orgId },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
    },
    select: recordSelect,
  });
}

// ─── Exists check ─────────────────────────────────────────────────────────────

export async function recordExists(
  recordId: string,
  orgId: string
): Promise<boolean> {
  const count = await prisma.financialRecord.count({
    where: { id: recordId, orgId, isDeleted: false },
  });
  return count > 0;
}

// ─── Category list ────────────────────────────────────────────────────────────

/**
 * Returns distinct categories used by an org.
 * Used for filter dropdowns in the frontend.
 */
export async function getDistinctCategories(orgId: string): Promise<string[]> {
  const result = await prisma.financialRecord.findMany({
    where: { orgId, isDeleted: false },
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });
  return result.map((r) => r.category);
}
