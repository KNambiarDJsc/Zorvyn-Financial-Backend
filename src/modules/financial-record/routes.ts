/**
 * Financial Record Routes
 *
 * Permission matrix per endpoint:
 *  POST   /records            → ADMIN only        (create)
 *  GET    /records            → ALL roles          (read)
 *  GET    /records/categories → ALL roles          (read)
 *  GET    /records/:id        → ALL roles          (read)
 *  PATCH  /records/:id        → ADMIN + ANALYST    (update)
 *  DELETE /records/:id        → ADMIN only         (soft delete)
 *
 * Idempotency applied to POST — prevents duplicate records on retry.
 */

import { FastifyInstance } from "fastify";
import { authenticate } from "../../middleware/auth.middleware";
import { requirePermission, requireAnyPermission } from "../../middleware/rbac.middleware";
import { idempotencyCheck, idempotencyStore } from "../../middleware/idempotency.middleware";
import { PERMISSIONS } from "../../constants/permissions";
import * as controller from "./controller";

export async function recordRoutes(app: FastifyInstance): Promise<void> {
    // ── POST /records — Admin only ────────────────────────────────────────────
    app.post(
        "/",
        {
            schema: {
                tags: ["Records"],
                summary: "Create a financial record",
                description: "Creates a new income or expense record. Idempotent — safe to retry with the same `Idempotency-Key` header.",
                security: [{ bearerAuth: [] }],
                headers: {
                    type: "object",
                    properties: {
                        "idempotency-key": { type: "string", format: "uuid", description: "UUID for idempotent request" },
                    },
                },
                body: {
                    type: "object",
                    required: ["amount", "type", "category", "date"],
                    properties: {
                        amount: { type: "number", exclusiveMinimum: 0, example: 2500.00 },
                        type: { type: "string", enum: ["INCOME", "EXPENSE"] },
                        category: { type: "string", example: "salary" },
                        description: { type: "string", maxLength: 500 },
                        date: { type: "string", format: "date-time", example: "2024-01-15T00:00:00.000Z" },
                    },
                },
                response: {
                    201: { description: "Record created", type: "object" },
                    400: { description: "Validation error" },
                    403: { description: "Forbidden — Admin only" },
                },
            },
            onRequest: [authenticate, requirePermission(PERMISSIONS.RECORDS_CREATE)],
            preParsing: [],
            // Idempotency: check before handler, store after
            // Using preHandler + onSend hooks via plugin registration
        },
        async (request, reply) => {
            await idempotencyCheck(request, reply);
            if (reply.sent) return;
            await controller.createRecordHandler(request, reply);
        }
    );

    // ── GET /records/categories — All roles ───────────────────────────────────
    // Must be registered BEFORE /:id to avoid routing conflict
    app.get(
        "/categories",
        {
            schema: {
                tags: ["Records"],
                summary: "List distinct categories",
                description: "Returns all distinct categories used in this org's records. Useful for filter dropdowns.",
                security: [{ bearerAuth: [] }],
                response: { 200: { description: "Category list", type: "object" } },
            },
            onRequest: [authenticate, requirePermission(PERMISSIONS.RECORDS_READ)],
        },
        controller.getCategoriesHandler
    );

    // ── GET /records — All roles ──────────────────────────────────────────────
    app.get(
        "/",
        {
            schema: {
                tags: ["Records"],
                summary: "List financial records",
                description: "Returns a paginated, filtered, and sorted list of financial records for the org.",
                security: [{ bearerAuth: [] }],
                querystring: {
                    type: "object",
                    properties: {
                        page: { type: "integer", minimum: 1, default: 1 },
                        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
                        type: { type: "string", enum: ["INCOME", "EXPENSE"] },
                        category: { type: "string" },
                        startDate: { type: "string", format: "date-time" },
                        endDate: { type: "string", format: "date-time" },
                        minAmount: { type: "number" },
                        maxAmount: { type: "number" },
                        sortBy: { type: "string", enum: ["date", "amount", "category", "createdAt"], default: "date" },
                        sortOrder: { type: "string", enum: ["asc", "desc"], default: "desc" },
                    },
                },
                response: {
                    200: { description: "Paginated record list", type: "object" },
                },
            },
            onRequest: [authenticate, requirePermission(PERMISSIONS.RECORDS_READ)],
        },
        controller.listRecordsHandler
    );

    // ── GET /records/:id — All roles ──────────────────────────────────────────
    app.get(
        "/:id",
        {
            schema: {
                tags: ["Records"],
                summary: "Get record by ID",
                description: "Returns a single financial record. Scoped to the current org.",
                security: [{ bearerAuth: [] }],
                params: {
                    type: "object",
                    required: ["id"],
                    properties: { id: { type: "string", format: "uuid" } },
                },
                response: {
                    200: { description: "Financial record", type: "object" },
                    404: { description: "Not found" },
                },
            },
            onRequest: [authenticate, requirePermission(PERMISSIONS.RECORDS_READ)],
        },
        controller.getRecordByIdHandler
    );

    // ── PATCH /records/:id — Admin + Analyst ──────────────────────────────────
    app.patch(
        "/:id",
        {
            schema: {
                tags: ["Records"],
                summary: "Update a financial record",
                description: "Partially update a record. At least one field must be provided. Full before/after state is captured in the audit log.",
                security: [{ bearerAuth: [] }],
                params: {
                    type: "object",
                    required: ["id"],
                    properties: { id: { type: "string", format: "uuid" } },
                },
                body: {
                    type: "object",
                    properties: {
                        amount: { type: "number", exclusiveMinimum: 0 },
                        type: { type: "string", enum: ["INCOME", "EXPENSE"] },
                        category: { type: "string" },
                        description: { type: "string", maxLength: 500, nullable: true },
                        date: { type: "string", format: "date-time" },
                    },
                },
                response: {
                    200: { description: "Updated record", type: "object" },
                    403: { description: "Forbidden — Admin or Analyst only" },
                    404: { description: "Not found" },
                },
            },
            onRequest: [
                authenticate,
                requireAnyPermission([PERMISSIONS.RECORDS_UPDATE]),
            ],
        },
        controller.updateRecordHandler
    );

    // ── DELETE /records/:id — Admin only ──────────────────────────────────────
    app.delete(
        "/:id",
        {
            schema: {
                tags: ["Records"],
                summary: "Soft delete a financial record",
                description: "Marks a record as deleted. The record is not physically removed — it remains in the database for audit and compliance purposes.",
                security: [{ bearerAuth: [] }],
                params: {
                    type: "object",
                    required: ["id"],
                    properties: { id: { type: "string", format: "uuid" } },
                },
                response: {
                    200: { description: "Deleted successfully", type: "object" },
                    403: { description: "Forbidden — Admin only" },
                    404: { description: "Not found" },
                },
            },
            onRequest: [authenticate, requirePermission(PERMISSIONS.RECORDS_DELETE)],
        },
        controller.deleteRecordHandler
    );
}
