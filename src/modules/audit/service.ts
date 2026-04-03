

import { prisma } from "../../config/db";
import { logger } from "../../utils/logger";
import type { AuditActionType, AuditEntityType } from "../../constants/audit-actions";
import type { RequestMeta } from "../../types/common";

export interface CreateAuditLogInput {
    orgId: string;
    userId: string;
    action: AuditActionType;
    entity: AuditEntityType;
    entityId: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    meta?: RequestMeta;
}


export async function createAuditLog(input: CreateAuditLogInput): Promise<void> {
    try {
        await prisma.auditLog.create({
            data: {
                orgId: input.orgId,
                userId: input.userId,
                action: input.action,
                entity: input.entity,
                entityId: input.entityId,
                before: input.before ?? null,
                after: input.after ?? null,
                ipAddress: input.meta?.ipAddress,
                userAgent: input.meta?.userAgent,
            },
        });
    } catch (err) {
        // Audit failures are logged but never propagated
        logger.error(
            { err, action: input.action, entityId: input.entityId },
            "Audit log write failed"
        );
    }
}


export async function createAuditLogTx(
    tx: any,
    input: CreateAuditLogInput
): Promise<void> {
    await tx.auditLog.create({
        data: {
            orgId: input.orgId,
            userId: input.userId,
            action: input.action,
            entity: input.entity,
            entityId: input.entityId,
            before: input.before ?? null,
            after: input.after ?? null,
            ipAddress: input.meta?.ipAddress,
            userAgent: input.meta?.userAgent,
        },
    });
}
