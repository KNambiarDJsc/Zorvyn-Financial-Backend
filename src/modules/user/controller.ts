/**
 * User Controller
 *
 * Thin HTTP layer — parse, delegate to service, respond.
 * No business logic here.
 */

import { FastifyRequest, FastifyReply } from "fastify";
import * as service from "./service";
import {
    validate,
    ListUsersQuerySchema,
    UserIdParamSchema,
    UpdateProfileSchema,
    UpdateUserRoleSchema,
    UpdateUserStatusSchema,
} from "./schema";
import { sendSuccess, buildPaginationMeta } from "../../utils/response";
import { UnauthorizedError } from "../../utils/errors";

function requireUser(request: FastifyRequest) {
    if (!request.user) throw new UnauthorizedError();
    return request.user;
}

function requestMeta(request: FastifyRequest) {
    return {
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
    };
}

// ─── GET /users/me ────────────────────────────────────────────────────────────

export async function getMeHandler(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const { userId, orgId } = requireUser(request);
    const profile = await service.getMyProfile(userId, orgId);
    sendSuccess(reply, profile);
}

// ─── PATCH /users/me ──────────────────────────────────────────────────────────

export async function updateMeHandler(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const { userId, orgId } = requireUser(request);
    const input = validate(UpdateProfileSchema, request.body);
    const updated = await service.updateMyProfile(userId, orgId, input, requestMeta(request));
    sendSuccess(reply, updated);
}

// ─── GET /users ───────────────────────────────────────────────────────────────

export async function listUsersHandler(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const { orgId } = requireUser(request);
    const query = validate(ListUsersQuerySchema, request.query);

    const { items, total } = await service.listUsers(orgId, query);

    sendSuccess(
        reply,
        items,
        200,
        buildPaginationMeta(total, query.page, query.limit)
    );
}

// ─── GET /users/:id ───────────────────────────────────────────────────────────

export async function getUserByIdHandler(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const { orgId } = requireUser(request);
    const { id } = validate(UserIdParamSchema, request.params);
    const user = await service.getUserById(id, orgId);
    sendSuccess(reply, user);
}

// ─── PATCH /users/:id/role ────────────────────────────────────────────────────

export async function updateUserRoleHandler(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const { userId: actorId, orgId } = requireUser(request);
    const { id: targetId } = validate(UserIdParamSchema, request.params);
    const input = validate(UpdateUserRoleSchema, request.body);

    const updated = await service.updateUserRole(
        actorId,
        targetId,
        orgId,
        input,
        requestMeta(request)
    );

    sendSuccess(reply, updated);
}

// ─── PATCH /users/:id/status ──────────────────────────────────────────────────

export async function updateUserStatusHandler(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const { userId: actorId, orgId } = requireUser(request);
    const { id: targetId } = validate(UserIdParamSchema, request.params);
    const input = validate(UpdateUserStatusSchema, request.body);

    const updated = await service.updateUserStatus(
        actorId,
        targetId,
        orgId,
        input,
        requestMeta(request)
    );

    sendSuccess(reply, updated);
}

// ─── GET /users/roles ─────────────────────────────────────────────────────────

export async function listRolesHandler(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    requireUser(request);
    const roles = await service.listRoles();
    sendSuccess(reply, roles);
}
