jest.mock("../../src/modules/financial-record/repository");
jest.mock("../../src/modules/audit/service");
jest.mock("../../src/config/db", () => ({
    prisma: {
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        $transaction: jest.fn((fn: (tx: unknown) => unknown) =>
            fn({
                financialRecord: {
                    create: jest.fn().mockResolvedValue({}),
                    update: jest.fn().mockResolvedValue({}),
                },
                auditLog: { create: jest.fn() },
            })
        ),
        idempotencyKey: {
            findFirst: jest.fn().mockResolvedValue(null),
            upsert: jest.fn().mockResolvedValue({}),
        },
    },
    connectDB: jest.fn(),
    disconnectDB: jest.fn(),
    pingDB: jest.fn().mockResolvedValue(true),
}));
jest.mock("../../src/config/redis", () => ({
    getRedis: jest.fn().mockReturnValue({ ping: jest.fn().mockResolvedValue("PONG"), quit: jest.fn() }),
    connectRedis: jest.fn(),
    disconnectRedis: jest.fn(),
    pingRedis: jest.fn().mockResolvedValue(true),
    cache: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn(), delPattern: jest.fn() },
    CacheKeys: { dashboardAll: (id: string) => `dashboard:*:${id}` },
}));

import { Prisma } from "@prisma/client";
import * as recordRepo from "../../src/modules/financial-record/repository";
import {
    buildTestApp,
    authHeader,
    assertSuccess,
    assertError,
} from "./helpers";

const mockRepo = recordRepo as jest.Mocked<typeof recordRepo>;

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const RECORD_ID = "00000000-0000-0000-0000-000000000099";

function makeRecord(overrides = {}) {
    return {
        id: RECORD_ID,
        amount: new Prisma.Decimal("1500.00"),
        type: "INCOME" as never,
        category: "salary",
        description: "Monthly salary",
        date: new Date("2024-01-15"),
        orgId: "00000000-0000-0000-0000-000000000001",
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { id: "u1", firstName: "Alice", lastName: "Admin" },
        ...overrides,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/records — ADMIN only
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/v1/records — role enforcement", () => {
    let app: Awaited<ReturnType<typeof buildTestApp>>["app"];

    beforeAll(async () => ({ app } = await buildTestApp()));
    afterAll(() => app.close());
    beforeEach(() => jest.clearAllMocks());

    const validPayload = {
        amount: 1500.00,
        type: "INCOME",
        category: "salary",
        date: "2024-01-15T00:00:00.000Z",
    };

    it("201 — ADMIN can create a record", async () => {
        const created = makeRecord();
        // Mock the transaction internals
        const { prisma } = require("../../src/config/db");
        (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => unknown) => {
            const tx = {
                financialRecord: { create: jest.fn().mockResolvedValue(created) },
                auditLog: { create: jest.fn() },
            };
            return fn(tx);
        });

        const res = await app.inject({
            method: "POST",
            url: "/api/v1/records",
            headers: authHeader("admin"),
            payload: validPayload,
        });

        expect(res.statusCode).toBe(201);
        assertSuccess(JSON.parse(res.body));
    });

    it("403 — ANALYST cannot create a record", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/api/v1/records",
            headers: authHeader("analyst"),
            payload: validPayload,
        });

        expect(res.statusCode).toBe(403);
        assertError(JSON.parse(res.body), "FORBIDDEN");
    });

    it("403 — VIEWER cannot create a record", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/api/v1/records",
            headers: authHeader("viewer"),
            payload: validPayload,
        });

        expect(res.statusCode).toBe(403);
        assertError(JSON.parse(res.body), "FORBIDDEN");
    });

    it("401 — unauthenticated request is rejected", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/api/v1/records",
            payload: validPayload,
            // No authorization header
        });

        expect(res.statusCode).toBe(401);
    });

    it("400 — rejects negative amount", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/api/v1/records",
            headers: authHeader("admin"),
            payload: { ...validPayload, amount: -500 },
        });

        expect(res.statusCode).toBe(400);
        assertError(JSON.parse(res.body), "VALIDATION_ERROR");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/records — All roles
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/v1/records — all roles can read", () => {
    let app: Awaited<ReturnType<typeof buildTestApp>>["app"];

    beforeAll(async () => ({ app } = await buildTestApp()));
    afterAll(() => app.close());
    beforeEach(() => {
        jest.clearAllMocks();
        mockRepo.listRecords.mockResolvedValue({
            items: [makeRecord()],
            total: 1,
        });
    });

    it("200 — ADMIN can list records", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/api/v1/records",
            headers: authHeader("admin"),
        });
        expect(res.statusCode).toBe(200);
        assertSuccess(JSON.parse(res.body));
    });

    it("200 — ANALYST can list records", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/api/v1/records",
            headers: authHeader("analyst"),
        });
        expect(res.statusCode).toBe(200);
    });

    it("200 — VIEWER can list records", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/api/v1/records",
            headers: authHeader("viewer"),
        });
        expect(res.statusCode).toBe(200);
    });

    it("includes pagination meta in response", async () => {
        mockRepo.listRecords.mockResolvedValue({ items: [makeRecord()], total: 42 });

        const res = await app.inject({
            method: "GET",
            url: "/api/v1/records?page=2&limit=10",
            headers: authHeader("admin"),
        });

        const body = JSON.parse(res.body) as {
            success: boolean;
            meta: { total: number; page: number; limit: number; totalPages: number };
        };
        expect(body.meta.total).toBe(42);
        expect(body.meta.page).toBe(2);
        expect(body.meta.limit).toBe(10);
        expect(body.meta.totalPages).toBe(5);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/records/:id — ADMIN + ANALYST
// ─────────────────────────────────────────────────────────────────────────────

describe("PATCH /api/v1/records/:id — role enforcement", () => {
    let app: Awaited<ReturnType<typeof buildTestApp>>["app"];

    beforeAll(async () => ({ app } = await buildTestApp()));
    afterAll(() => app.close());
    beforeEach(() => jest.clearAllMocks());

    it("200 — ADMIN can update a record", async () => {
        mockRepo.findRecordById.mockResolvedValue(makeRecord());
        const { prisma } = require("../../src/config/db");
        (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => unknown) => {
            const tx = {
                financialRecord: {
                    update: jest.fn().mockResolvedValue(makeRecord({ amount: new Prisma.Decimal("2000.00") })),
                },
                auditLog: { create: jest.fn() },
            };
            return fn(tx);
        });

        const res = await app.inject({
            method: "PATCH",
            url: `/api/v1/records/${RECORD_ID}`,
            headers: authHeader("admin"),
            payload: { amount: 2000 },
        });

        expect(res.statusCode).toBe(200);
    });

    it("200 — ANALYST can update a record", async () => {
        mockRepo.findRecordById.mockResolvedValue(makeRecord());
        const { prisma } = require("../../src/config/db");
        (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => unknown) => {
            const tx = {
                financialRecord: {
                    update: jest.fn().mockResolvedValue(makeRecord()),
                },
                auditLog: { create: jest.fn() },
            };
            return fn(tx);
        });

        const res = await app.inject({
            method: "PATCH",
            url: `/api/v1/records/${RECORD_ID}`,
            headers: authHeader("analyst"),
            payload: { category: "consulting" },
        });

        expect(res.statusCode).toBe(200);
    });

    it("403 — VIEWER cannot update a record", async () => {
        const res = await app.inject({
            method: "PATCH",
            url: `/api/v1/records/${RECORD_ID}`,
            headers: authHeader("viewer"),
            payload: { amount: 999 },
        });

        expect(res.statusCode).toBe(403);
        assertError(JSON.parse(res.body), "FORBIDDEN");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/v1/records/:id — ADMIN only
// ─────────────────────────────────────────────────────────────────────────────

describe("DELETE /api/v1/records/:id — ADMIN only", () => {
    let app: Awaited<ReturnType<typeof buildTestApp>>["app"];

    beforeAll(async () => ({ app } = await buildTestApp()));
    afterAll(() => app.close());
    beforeEach(() => jest.clearAllMocks());

    it("200 — ADMIN can soft delete a record", async () => {
        mockRepo.findRecordById.mockResolvedValue(makeRecord());
        const { prisma } = require("../../src/config/db");
        (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => unknown) => {
            const tx = {
                financialRecord: { update: jest.fn().mockResolvedValue({}) },
                auditLog: { create: jest.fn() },
            };
            return fn(tx);
        });

        const res = await app.inject({
            method: "DELETE",
            url: `/api/v1/records/${RECORD_ID}`,
            headers: authHeader("admin"),
        });

        expect(res.statusCode).toBe(200);
    });

    it("403 — ANALYST cannot delete a record", async () => {
        const res = await app.inject({
            method: "DELETE",
            url: `/api/v1/records/${RECORD_ID}`,
            headers: authHeader("analyst"),
        });

        expect(res.statusCode).toBe(403);
    });

    it("403 — VIEWER cannot delete a record", async () => {
        const res = await app.inject({
            method: "DELETE",
            url: `/api/v1/records/${RECORD_ID}`,
            headers: authHeader("viewer"),
        });

        expect(res.statusCode).toBe(403);
    });

    it("404 — returns not found for non-existent record", async () => {
        mockRepo.findRecordById.mockResolvedValue(null);

        const res = await app.inject({
            method: "DELETE",
            url: `/api/v1/records/${RECORD_ID}`,
            headers: authHeader("admin"),
        });

        expect(res.statusCode).toBe(404);
        assertError(JSON.parse(res.body), "NOT_FOUND");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/records/:id — cross-org isolation
// ─────────────────────────────────────────────────────────────────────────────

describe("Tenant isolation — cross-org access", () => {
    let app: Awaited<ReturnType<typeof buildTestApp>>["app"];

    beforeAll(async () => ({ app } = await buildTestApp()));
    afterAll(() => app.close());

    it("404 — cannot access another org's record (repo returns null for wrong orgId)", async () => {
        // Repo enforces orgId filter — returns null for cross-org queries
        mockRepo.findRecordById.mockResolvedValue(null);

        const res = await app.inject({
            method: "GET",
            url: `/api/v1/records/${RECORD_ID}`,
            headers: authHeader("admin"),
        });

        expect(res.statusCode).toBe(404);
        // Response must not reveal whether the record exists in another org
        const body = JSON.parse(res.body) as { error: { message: string } };
        expect(body.error.message).not.toContain("another org");
        expect(body.error.message).not.toContain("different organization");
    });
});
