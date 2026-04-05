import { FastifyRequest, FastifyReply } from "fastify";
import { RoleName } from "@prisma/client";
import { Permission, hasPermission, hasAnyPermission } from "../constants/permissions";

// ─── Role-based guard ────────────────────────────────────────────────────────

export function authorize(allowedRoles: RoleName[]) {
    return async function (
        request: FastifyRequest,
        reply: FastifyReply
    ): Promise<void> {
        const user = request.user;

        if (!user) {
            reply.status(401).send({
                success: false,
                error: { code: "UNAUTHORIZED", message: "Authentication required" },
            });
            return;
        }

        if (!allowedRoles.includes(user.role)) {
            reply.status(403).send({
                success: false,
                error: {
                    code: "FORBIDDEN",
                    message: `This action requires one of the following roles: ${allowedRoles.join(", ")}`,
                },
            });
        }
    };
}

// ─── Permission-based guard ──────────────────────────────────────────────────

export function requirePermission(permission: Permission) {
    return async function (
        request: FastifyRequest,
        reply: FastifyReply
    ): Promise<void> {
        const user = request.user;

        if (!user) {
            reply.status(401).send({
                success: false,
                error: { code: "UNAUTHORIZED", message: "Authentication required" },
            });
            return;
        }

        if (!hasPermission(user.role, permission)) {
            reply.status(403).send({
                success: false,
                error: {
                    code: "FORBIDDEN",
                    message: "You do not have permission to perform this action",
                },
            });
        }
    };
}

// ─── Any-of-permissions guard ────────────────────────────────────────────────

export function requireAnyPermission(permissions: Permission[]) {
    return async function (
        request: FastifyRequest,
        reply: FastifyReply
    ): Promise<void> {
        const user = request.user;

        if (!user) {
            reply.status(401).send({
                success: false,
                error: { code: "UNAUTHORIZED", message: "Authentication required" },
            });
            return;
        }

        if (!hasAnyPermission(user.role, permissions)) {
            reply.status(403).send({
                success: false,
                error: {
                    code: "FORBIDDEN",
                    message: "You do not have permission to perform this action",
                },
            });
        }
    };
}
