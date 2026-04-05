/**
 * Auth Integration Tests
 *
 * Tests the full HTTP flow for authentication endpoints.
 * DB calls are mocked at the repository layer so tests run
 * without a real database — fast and deterministic.
 */

jest.mock("../../src/modules/auth/repository");
jest.mock("../../src/modules/audit/service");
jest.mock("../../src/config/db", () => ({
    prisma: {
        $connect: jest.fn(),
        $disconnect: jest.fn(),
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
    getRedis: jest.fn().mockReturnValue({ get: jest.fn(), setex: jest.fn(), del: jest.fn(), keys: jest.fn().mockResolvedValue([]), ping: jest.fn().mockResolvedValue("PONG"), quit: jest.fn() }),
    connectRedis: jest.fn(),
    disconnectRedis: jest.fn(),
    pingRedis: jest.fn().mockResolvedValue(true),
    cache: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn(), delPattern: jest.fn() },
    CacheKeys: { dashboardSummary: (id: string) => `dashboard:summary:${id}`, dashboardCategories: (id: string) => `dashboard:categories:${id}`, dashboardTrends: (id: string) => `dashboard:trends:${id}`, dashboardRecent: (id: string) => `dashboard:recent:${id}`, dashboardAll: (id: string) => `dashboard:*:${id}` },
}));
jest.mock("bcrypt");

import bcrypt from "bcrypt";
import * as authRepo from "../../src/modules/auth/repository";
import { buildTestApp, assertSuccess, assertError } from "./helpers";

const mockAuthRepo = authRepo as jest.Mocked<typeof authRepo>;
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

// ─── Shared fixture ───────────────────────────────────────────────────────────

const MOCK_USER = {
    id: "user-1",
    email: "alice@test.com",
    passwordHash: "$2b$12$hash",
    firstName: "Alice",
    lastName: "Smith",
    orgId: "org-1",
    roleId: "role-1",
    status: "ACTIVE" as const,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    role: { name: "ADMIN" },
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/register
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/v1/auth/register", () => {
    let app: Awaited<ReturnType<typeof buildTestApp>>["app"];

    beforeAll(async () => {
        ({ app } = await buildTestApp());
    });

    afterAll(() => app.close());
    beforeEach(() => jest.clearAllMocks());

    it("201 — registers a new user with a new org", async () => {
        mockAuthRepo.findUserByEmail.mockResolvedValue(null);
        (mockBcrypt.hash as jest.Mock).mockResolvedValue("$2b$12$hashed");
        mockAuthRepo.createUserWithOrg.mockResolvedValue({
            ...MOCK_USER,
            organization: { name: "Test Corp" },
        } as never);
        mockAuthRepo.createRefreshToken.mockResolvedValue({} as never);

        const res = await app.inject({
            method: "POST",
            url: "/api/v1/auth/register",
            payload: {
                email: "alice@test.com",
                password: "Secure123!",
                firstName: "Alice",
                lastName: "Smith",
                orgName: "Test Corp",
            },
        });

        expect(res.statusCode).toBe(201);
        const body = JSON.parse(res.body);
        assertSuccess(body);
        expect((body.data as { tokens: { accessToken: string } }).tokens.accessToken).toBeDefined();
    });

    it("400 — rejects weak password", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/api/v1/auth/register",
            payload: {
                email: "alice@test.com",
                password: "weak",        // fails policy
                firstName: "Alice",
                lastName: "Smith",
                orgName: "Test Corp",
            },
        });

        expect(res.statusCode).toBe(400);
        assertError(JSON.parse(res.body), "VALIDATION_ERROR");
    });

    it("409 — rejects duplicate email", async () => {
        mockAuthRepo.findUserByEmail.mockResolvedValue(MOCK_USER as never);
        (mockBcrypt.hash as jest.Mock).mockResolvedValue("$2b$12$hashed");

        const res = await app.inject({
            method: "POST",
            url: "/api/v1/auth/register",
            payload: {
                email: "alice@test.com",
                password: "Secure123!",
                firstName: "Alice",
                lastName: "Smith",
                orgName: "Test Corp",
            },
        });

        expect(res.statusCode).toBe(409);
        assertError(JSON.parse(res.body), "CONFLICT");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/login
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/v1/auth/login", () => {
    let app: Awaited<ReturnType<typeof buildTestApp>>["app"];

    beforeAll(async () => {
        ({ app } = await buildTestApp());
    });

    afterAll(() => app.close());
    beforeEach(() => jest.clearAllMocks());

    it("200 — returns token pair on valid credentials", async () => {
        mockAuthRepo.findUserByEmail.mockResolvedValue(MOCK_USER as never);
        (mockBcrypt.compare as jest.Mock).mockResolvedValue(true);
        mockAuthRepo.createRefreshToken.mockResolvedValue({} as never);
        mockAuthRepo.updateUserLastLogin.mockResolvedValue();

        const res = await app.inject({
            method: "POST",
            url: "/api/v1/auth/login",
            payload: { email: "alice@test.com", password: "Secure123!" },
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        assertSuccess(body);

        const data = body.data as {
            user: { role: string };
            tokens: { accessToken: string; refreshToken: string };
        };
        expect(data.tokens.accessToken).toBeDefined();
        expect(data.tokens.refreshToken).toBeDefined();
        expect(data.user.role).toBe("ADMIN");
    });

    it("401 — rejects wrong password", async () => {
        mockAuthRepo.findUserByEmail.mockResolvedValue(MOCK_USER as never);
        (mockBcrypt.compare as jest.Mock).mockResolvedValue(false);

        const res = await app.inject({
            method: "POST",
            url: "/api/v1/auth/login",
            payload: { email: "alice@test.com", password: "WrongPass1!" },
        });

        expect(res.statusCode).toBe(401);
        assertError(JSON.parse(res.body), "UNAUTHORIZED");
    });

    it("401 — rejects unknown email with same message as wrong password (no enumeration)", async () => {
        mockAuthRepo.findUserByEmail.mockResolvedValue(null);

        const notFoundRes = await app.inject({
            method: "POST",
            url: "/api/v1/auth/login",
            payload: { email: "ghost@test.com", password: "anything" },
        });

        mockAuthRepo.findUserByEmail.mockResolvedValue(MOCK_USER as never);
        (mockBcrypt.compare as jest.Mock).mockResolvedValue(false);

        const wrongPassRes = await app.inject({
            method: "POST",
            url: "/api/v1/auth/login",
            payload: { email: "alice@test.com", password: "WrongPass1!" },
        });

        const notFoundBody = JSON.parse(notFoundRes.body) as { error: { message: string } };
        const wrongPassBody = JSON.parse(wrongPassRes.body) as { error: { message: string } };

        // Both 401s — same message
        expect(notFoundRes.statusCode).toBe(401);
        expect(wrongPassRes.statusCode).toBe(401);
        expect(notFoundBody.error.message).toBe(wrongPassBody.error.message);
    });

    it("403 — rejects suspended user", async () => {
        mockAuthRepo.findUserByEmail.mockResolvedValue({
            ...MOCK_USER,
            status: "SUSPENDED",
        } as never);

        const res = await app.inject({
            method: "POST",
            url: "/api/v1/auth/login",
            payload: { email: "alice@test.com", password: "Secure123!" },
        });

        expect(res.statusCode).toBe(403);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/logout
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/v1/auth/logout", () => {
    let app: Awaited<ReturnType<typeof buildTestApp>>["app"];

    beforeAll(async () => {
        ({ app } = await buildTestApp());
    });

    afterAll(() => app.close());

    it("200 — always succeeds (even with invalid token)", async () => {
        mockAuthRepo.revokeRefreshToken.mockResolvedValue();

        const res = await app.inject({
            method: "POST",
            url: "/api/v1/auth/logout",
            payload: { refreshToken: "any-token" },
        });

        // Logout must never fail from the client's perspective
        expect(res.statusCode).toBe(200);
    });
});
