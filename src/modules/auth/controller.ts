

import { FastifyRequest, FastifyReply } from "fastify";
import * as service from "./service";
import { validate, RegisterSchema, LoginSchema, RefreshSchema, LogoutSchema } from "./schema";
import { sendSuccess } from "../../utils/response";
import { RequestMeta } from "../../types/common";
import { AuditAction, AuditEntity } from "../../constants/audit-actions";
import { createAuditLog } from "../audit/service";


export async function registerHandler(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const input = validate(RegisterSchema, request.body);
    const result = await service.register(input);

    // Audit: new user created
    await createAuditLog({
        orgId: result.user.orgId,
        userId: result.user.id,
        action: AuditAction.REGISTER,
        entity: AuditEntity.USER,
        entityId: result.user.id,
        after: { userId: result.user.id, email: result.user.email, role: result.user.role },
        meta: requestMeta(request),
    });

    sendSuccess(reply, result, 201);
}


export async function loginHandler(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const input = validate(LoginSchema, request.body);
    const result = await service.login(input);

    // Audit: successful login
    await createAuditLog({
        orgId: result.user.orgId,
        userId: result.user.id,
        action: AuditAction.LOGIN,
        entity: AuditEntity.AUTH,
        entityId: result.user.id,
        meta: requestMeta(request),
    });

    sendSuccess(reply, result);
}

// ─── Refresh ──────────────────────────────────────────────────────────────────

export async function refreshHandler(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const input = validate(RefreshSchema, request.body);
    const tokens = await service.refresh(input);

    sendSuccess(reply, { tokens });
}


export async function logoutHandler(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const input = validate(LogoutSchema, request.body);
    await service.logout(input);


    if (request.user) {
        await createAuditLog({
            orgId: request.user.orgId,
            userId: request.user.userId,
            action: AuditAction.LOGOUT,
            entity: AuditEntity.AUTH,
            entityId: request.user.userId,
            meta: requestMeta(request),
        });
    }

    sendSuccess(reply, { message: "Logged out successfully" });
}


function requestMeta(request: FastifyRequest): RequestMeta {
    return {
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
    };
}
