/**
 * User Routes
 *
 * Route-level RBAC is applied here, not in controllers.
 * Each route declares exactly what permissions it requires
 * so the access rules are visible at a glance.
 *
 * Pattern:
 *   onRequest: [authenticate, requirePermission(PERMISSIONS.X)]
 *
 * authenticate  → populates req.user
 * requirePermission → checks req.user.role against permission matrix
 */

import { FastifyInstance } from "fastify";
import { RoleName } from "@prisma/client";
import { authenticate } from "../../middleware/auth.middleware";
import { requirePermission, authorize } from "../../middleware/rbac.middleware";
import { PERMISSIONS } from "../../constants/permissions";
import * as controller from "./controller";

export async function userRoutes(app: FastifyInstance): Promise<void> {
    // ── GET /users/me — any authenticated user ────────────────────────────────
    app.get(
        "/me",
        {
            schema: {
                tags: ["Users"],
                summary: "Get own profile",
                description: "Returns the profile of the currently authenticated user.",
                security: [{ bearerAuth: [] }],
                response: {
                    200: { description: "User profile", type: "object" },
                    401: { description: "Unauthorized" },
                },
            },
            onRequest: [authenticate, requirePermission(PERMISSIONS.USERS_READ_SELF)],
        },
        controller.getMeHandler
    );

    // ── PATCH /users/me — any authenticated user ──────────────────────────────
    app.patch(
        "/me",
        {
            schema: {
                tags: ["Users"],
                summary: "Update own profile",
                description: "Update the first or last name of the current user.",
                security: [{ bearerAuth: [] }],
                body: {
                    type: "object",
                    properties: {
                        firstName: { type: "string", minLength: 1, maxLength: 64 },
                        lastName: { type: "string", minLength: 1, maxLength: 64 },
                    },
                },
                response: {
                    200: { description: "Updated profile", type: "object" },
                    401: { description: "Unauthorized" },
                },
            },
            onRequest: [authenticate, requirePermission(PERMISSIONS.USERS_READ_SELF)],
        },
        controller.updateMeHandler
    );

    // ── GET /users/roles — any authenticated user ─────────────────────────────
    // Placed before /:id to avoid routing ambiguity
    app.get(
        "/roles",
        {
            schema: {
                tags: ["Users"],
                summary: "List all roles",
                description: "Returns all available roles in the system.",
                security: [{ bearerAuth: [] }],
                response: { 200: { description: "List of roles", type: "object" } },
            },
            onRequest: [authenticate, requirePermission(PERMISSIONS.USERS_READ_SELF)],
        },
        controller.listRolesHandler
    );

    // ── GET /users — Admin only ───────────────────────────────────────────────
    app.get(
        "/",
        {
            schema: {
                tags: ["Users"],
                summary: "List all users in organisation",
                description:
                    "Returns a paginated list of all users in the org. Supports filtering by role, status, and search.",
                security: [{ bearerAuth: [] }],
                querystring: {
                    type: "object",
                    properties: {
                        page: { type: "integer", minimum: 1, default: 1 },
                        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
                        role: { type: "string", enum: Object.values(RoleName) },
                        status: { type: "string", enum: ["ACTIVE", "INACTIVE", "SUSPENDED"] },
                        search: { type: "string" },
                    },
                },
                response: {
                    200: { description: "Paginated user list", type: "object" },
                    403: { description: "Forbidden — Admin only" },
                },
            },
            onRequest: [authenticate, requirePermission(PERMISSIONS.USERS_READ_ALL)],
        },
        controller.listUsersHandler
    );

    // ── GET /users/:id — Admin only ───────────────────────────────────────────
    app.get(
        "/:id",
        {
            schema: {
                tags: ["Users"],
                summary: "Get user by ID",
                description: "Returns a specific user's profile. Scoped to the current org.",
                security: [{ bearerAuth: [] }],
                params: {
                    type: "object",
                    required: ["id"],
                    properties: { id: { type: "string", format: "uuid" } },
                },
                response: {
                    200: { description: "User profile", type: "object" },
                    404: { description: "User not found" },
                },
            },
            onRequest: [authenticate, requirePermission(PERMISSIONS.USERS_READ_ALL)],
        },
        controller.getUserByIdHandler
    );

    // ── PATCH /users/:id/role — Admin only ────────────────────────────────────
    app.patch(
        "/:id/role",
        {
            schema: {
                tags: ["Users"],
                summary: "Update user role",
                description:
                    "Change a user's role. Cannot demote yourself. Cannot demote the last admin in the org.",
                security: [{ bearerAuth: [] }],
                params: {
                    type: "object",
                    required: ["id"],
                    properties: { id: { type: "string", format: "uuid" } },
                },
                body: {
                    type: "object",
                    required: ["role"],
                    properties: {
                        role: { type: "string", enum: Object.values(RoleName) },
                    },
                },
                response: {
                    200: { description: "Updated user", type: "object" },
                    403: { description: "Forbidden" },
                    404: { description: "User not found" },
                    409: { description: "Last admin conflict" },
                },
            },
            onRequest: [authenticate, authorize([RoleName.ADMIN])],
        },
        controller.updateUserRoleHandler
    );

    // ── PATCH /users/:id/status — Admin only ──────────────────────────────────
    app.patch(
        "/:id/status",
        {
            schema: {
                tags: ["Users"],
                summary: "Update user status",
                description:
                    "Activate, deactivate, or suspend a user. Suspending or deactivating revokes all active sessions immediately.",
                security: [{ bearerAuth: [] }],
                params: {
                    type: "object",
                    required: ["id"],
                    properties: { id: { type: "string", format: "uuid" } },
                },
                body: {
                    type: "object",
                    required: ["status"],
                    properties: {
                        status: { type: "string", enum: ["ACTIVE", "INACTIVE", "SUSPENDED"] },
                    },
                },
                response: {
                    200: { description: "Updated user", type: "object" },
                    403: { description: "Forbidden" },
                    404: { description: "User not found" },
                    409: { description: "Last admin conflict" },
                },
            },
            onRequest: [authenticate, authorize([RoleName.ADMIN])],
        },
        controller.updateUserStatusHandler
    );
}
