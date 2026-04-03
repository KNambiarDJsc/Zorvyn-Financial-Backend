/**
 * Dashboard Routes
 *
 * All endpoints are read-only — available to all authenticated roles.
 * Viewers, Analysts, and Admins can all see the dashboard.
 * Data is already scoped to the org — no role-filtering needed here.
 *
 * Cache headers are set on responses so clients can respect TTLs.
 */

import { FastifyInstance } from "fastify";
import { authenticate } from "../../middleware/auth.middleware";
import { requirePermission } from "../../middleware/rbac.middleware";
import { PERMISSIONS } from "../../constants/permissions";
import * as controller from "./controller";

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
    // All dashboard routes require authentication and DASHBOARD_READ permission
    // Apply to the whole plugin scope via addHook
    app.addHook("onRequest", authenticate);
    app.addHook("onRequest", requirePermission(PERMISSIONS.DASHBOARD_READ));

    // ── GET /dashboard/summary ────────────────────────────────────────────────
    app.get(
        "/summary",
        {
            schema: {
                tags: ["Dashboard"],
                summary: "Financial summary",
                description:
                    "Returns total income, total expenses, net balance, and record counts. Optionally filtered by date range. Cached for 30s.",
                security: [{ bearerAuth: [] }],
                querystring: {
                    type: "object",
                    properties: {
                        startDate: { type: "string", format: "date-time", description: "Filter start (inclusive)" },
                        endDate: { type: "string", format: "date-time", description: "Filter end (inclusive)" },
                    },
                },
                response: {
                    200: {
                        description: "Summary data",
                        type: "object",
                        properties: {
                            success: { type: "boolean" },
                            data: {
                                type: "object",
                                properties: {
                                    totalIncome: { type: "string" },
                                    totalExpenses: { type: "string" },
                                    netBalance: { type: "string" },
                                    recordCount: { type: "integer" },
                                    incomeCount: { type: "integer" },
                                    expenseCount: { type: "integer" },
                                    period: {
                                        type: "object",
                                        properties: {
                                            startDate: { type: "string", nullable: true },
                                            endDate: { type: "string", nullable: true },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        controller.summaryHandler
    );

    // ── GET /dashboard/categories ─────────────────────────────────────────────
    app.get(
        "/categories",
        {
            schema: {
                tags: ["Dashboard"],
                summary: "Category breakdown",
                description:
                    "Returns per-category income and expense totals with percentage share. Useful for pie/donut charts.",
                security: [{ bearerAuth: [] }],
                querystring: {
                    type: "object",
                    properties: {
                        startDate: { type: "string", format: "date-time" },
                        endDate: { type: "string", format: "date-time" },
                        type: { type: "string", enum: ["INCOME", "EXPENSE"], description: "Filter to one type" },
                    },
                },
                response: {
                    200: {
                        description: "Category breakdown",
                        type: "object",
                        properties: {
                            success: { type: "boolean" },
                            data: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        category: { type: "string" },
                                        type: { type: "string" },
                                        total: { type: "string" },
                                        count: { type: "integer" },
                                        percentage: { type: "number", description: "Share of total for this type (0-100)" },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        controller.categoriesHandler
    );

    // ── GET /dashboard/trends ─────────────────────────────────────────────────
    app.get(
        "/trends",
        {
            schema: {
                tags: ["Dashboard"],
                summary: "Income vs expense trends",
                description:
                    "Returns time-series data grouped by day, week, or month. Suitable for line/bar charts. Defaults to monthly granularity.",
                security: [{ bearerAuth: [] }],
                querystring: {
                    type: "object",
                    properties: {
                        startDate: { type: "string", format: "date-time" },
                        endDate: { type: "string", format: "date-time" },
                        granularity: {
                            type: "string",
                            enum: ["daily", "weekly", "monthly"],
                            default: "monthly",
                            description: "Time bucket size",
                        },
                    },
                },
                response: {
                    200: {
                        description: "Trend data points",
                        type: "object",
                        properties: {
                            success: { type: "boolean" },
                            data: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        period: { type: "string", description: "e.g. '2024-01' or '2024-W03'" },
                                        income: { type: "string" },
                                        expenses: { type: "string" },
                                        net: { type: "string" },
                                        recordCount: { type: "integer" },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        controller.trendsHandler
    );

    // ── GET /dashboard/recent ─────────────────────────────────────────────────
    app.get(
        "/recent",
        {
            schema: {
                tags: ["Dashboard"],
                summary: "Recent activity",
                description:
                    "Returns the most recent financial records for the org. Default 10, max 50.",
                security: [{ bearerAuth: [] }],
                querystring: {
                    type: "object",
                    properties: {
                        limit: {
                            type: "integer",
                            minimum: 1,
                            maximum: 50,
                            default: 10,
                            description: "Number of recent records to return",
                        },
                    },
                },
                response: {
                    200: {
                        description: "Recent activity list",
                        type: "object",
                        properties: {
                            success: { type: "boolean" },
                            data: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        id: { type: "string" },
                                        amount: { type: "string" },
                                        type: { type: "string" },
                                        category: { type: "string" },
                                        description: { type: "string", nullable: true },
                                        date: { type: "string" },
                                        createdBy: {
                                            type: "object",
                                            properties: {
                                                id: { type: "string" },
                                                firstName: { type: "string" },
                                                lastName: { type: "string" },
                                            },
                                        },
                                        createdAt: { type: "string" },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        controller.recentHandler
    );
}
