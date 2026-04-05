jest.mock("../../src/modules/dashboard/repository");
jest.mock("../../src/config/db", () => ({
    prisma: { $connect: jest.fn(), $disconnect: jest.fn() },
    connectDB: jest.fn(),
    disconnectDB: jest.fn(),
    pingDB: jest.fn().mockResolvedValue(true),
}));

const mockCacheStore: Record<string, unknown> = {};
jest.mock("../../src/config/redis", () => ({
    getRedis: jest.fn().mockReturnValue({ ping: jest.fn().mockResolvedValue("PONG"), quit: jest.fn() }),
    connectRedis: jest.fn(),
    disconnectRedis: jest.fn(),
    pingRedis: jest.fn().mockResolvedValue(true),
    cache: {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(undefined),
        del: jest.fn(),
        delPattern: jest.fn(),
    },
    CacheKeys: {
        dashboardSummary: (id: string) => `dashboard:summary:${id}`,
        dashboardCategories: (id: string) => `dashboard:categories:${id}`,
        dashboardTrends: (id: string) => `dashboard:trends:${id}`,
        dashboardRecent: (id: string) => `dashboard:recent:${id}`,
        dashboardAll: (id: string) => `dashboard:*:${id}`,
    },
}));

import * as dashRepo from "../../src/modules/dashboard/repository";
import { cache } from "../../src/config/redis";
import {
    buildTestApp,
    authHeader,
    assertSuccess,
    assertError,
} from "./helpers";

const mockRepo = dashRepo as jest.Mocked<typeof dashRepo>;
const mockCache = cache as jest.Mocked<typeof cache>;

// ─── Shared DB mock responses ─────────────────────────────────────────────────

function mockSummaryResponse() {
    mockRepo.fetchSummary.mockResolvedValue({
        total_income: "8500.00",
        total_expenses: "3200.50",
        net_balance: "5299.50",
        record_count: BigInt(15),
        income_count: BigInt(8),
        expense_count: BigInt(7),
    });
}

function mockCategoryResponse() {
    mockRepo.fetchCategoryBreakdown.mockResolvedValue([
        { category: "salary", type: "INCOME", total: "8500.00", count: BigInt(8) },
        { category: "rent", type: "EXPENSE", total: "2000.00", count: BigInt(1) },
        { category: "food", type: "EXPENSE", total: "1200.50", count: BigInt(6) },
    ]);
}

function mockTrendsResponse() {
    mockRepo.fetchTrends.mockResolvedValue([
        { period: "2024-01", income: "8500.00", expenses: "3200.50", net: "5299.50", record_count: BigInt(15) },
        { period: "2024-02", income: "9000.00", expenses: "4100.00", net: "4900.00", record_count: BigInt(18) },
    ]);
}

function mockRecentResponse() {
    mockRepo.fetchRecentActivity.mockResolvedValue([
        {
            id: "rec-1",
            amount: "1500.00",
            type: "INCOME",
            category: "salary",
            description: "Monthly salary",
            date: new Date("2024-01-15"),
            user_id: "user-1",
            first_name: "Alice",
            last_name: "Admin",
            created_at: new Date("2024-01-15"),
        },
    ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/dashboard/summary
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/v1/dashboard/summary", () => {
    let app: Awaited<ReturnType<typeof buildTestApp>>["app"];

    beforeAll(async () => ({ app } = await buildTestApp()));
    afterAll(() => app.close());
    beforeEach(() => {
        jest.clearAllMocks();
        (mockCache.get as jest.Mock).mockResolvedValue(null); // cache miss by default
        mockSummaryResponse();
    });

    it("200 — ADMIN receives summary data", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/api/v1/dashboard/summary",
            headers: authHeader("admin"),
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        assertSuccess(body);

        const data = (body as { data: { totalIncome: string; netBalance: string; recordCount: number } }).data;
        expect(data.totalIncome).toBe("8500.00");
        expect(data.netBalance).toBe("5299.50");
        expect(data.recordCount).toBe(15);
    });

    it("200 — ANALYST can access summary", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/api/v1/dashboard/summary",
            headers: authHeader("analyst"),
        });
        expect(res.statusCode).toBe(200);
    });

    it("200 — VIEWER can access summary", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/api/v1/dashboard/summary",
            headers: authHeader("viewer"),
        });
        expect(res.statusCode).toBe(200);
    });

    it("401 — rejects unauthenticated request", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/api/v1/dashboard/summary",
            // No auth header
        });
        expect(res.statusCode).toBe(401);
        assertError(JSON.parse(res.body));
    });

    it("returns cached data without hitting DB on cache hit", async () => {
        const cachedSummary = {
            totalIncome: "5000.00", totalExpenses: "2000.00", netBalance: "3000.00",
            recordCount: 10, incomeCount: 6, expenseCount: 4,
            period: { startDate: null, endDate: null },
        };
        (mockCache.get as jest.Mock).mockResolvedValue(cachedSummary);

        const res = await app.inject({
            method: "GET",
            url: "/api/v1/dashboard/summary",
            headers: authHeader("admin"),
        });

        expect(res.statusCode).toBe(200);
        expect(mockRepo.fetchSummary).not.toHaveBeenCalled(); // DB bypassed
        const body = JSON.parse(res.body) as { data: { totalIncome: string } };
        expect(body.data.totalIncome).toBe("5000.00");
    });

    it("400 — rejects invalid date range (startDate after endDate)", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/api/v1/dashboard/summary?startDate=2024-12-31T00:00:00.000Z&endDate=2024-01-01T00:00:00.000Z",
            headers: authHeader("admin"),
        });
        expect(res.statusCode).toBe(400);
        assertError(JSON.parse(res.body), "VALIDATION_ERROR");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/dashboard/categories
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/v1/dashboard/categories", () => {
    let app: Awaited<ReturnType<typeof buildTestApp>>["app"];

    beforeAll(async () => ({ app } = await buildTestApp()));
    afterAll(() => app.close());
    beforeEach(() => {
        jest.clearAllMocks();
        (mockCache.get as jest.Mock).mockResolvedValue(null);
        mockCategoryResponse();
    });

    it("200 — returns category breakdown with percentages", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/api/v1/dashboard/categories",
            headers: authHeader("admin"),
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body) as {
            data: Array<{ category: string; percentage: number; total: string }>;
        };

        const salary = body.data.find((r) => r.category === "salary");
        expect(salary).toBeDefined();
        expect(salary?.percentage).toBe(100); // only income item — 100%
        expect(typeof salary?.total).toBe("string"); // amounts always strings
    });

    it("200 — filters by type when provided", async () => {
        mockRepo.fetchCategoryBreakdown.mockResolvedValue([
            { category: "rent", type: "EXPENSE", total: "2000.00", count: BigInt(1) },
        ]);

        const res = await app.inject({
            method: "GET",
            url: "/api/v1/dashboard/categories?type=EXPENSE",
            headers: authHeader("admin"),
        });

        expect(res.statusCode).toBe(200);
        expect(mockRepo.fetchCategoryBreakdown).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ type: "EXPENSE" })
        );
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/dashboard/trends
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/v1/dashboard/trends", () => {
    let app: Awaited<ReturnType<typeof buildTestApp>>["app"];

    beforeAll(async () => ({ app } = await buildTestApp()));
    afterAll(() => app.close());
    beforeEach(() => {
        jest.clearAllMocks();
        (mockCache.get as jest.Mock).mockResolvedValue(null);
        mockTrendsResponse();
    });

    it("200 — returns monthly trend data by default", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/api/v1/dashboard/trends",
            headers: authHeader("analyst"),
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body) as {
            data: Array<{ period: string; income: string; net: string; recordCount: number }>;
        };

        expect(body.data).toHaveLength(2);
        expect(body.data[0]?.period).toBe("2024-01");
        expect(body.data[0]?.income).toBe("8500.00");
        expect(body.data[0]?.recordCount).toBe(15);
    });

    it("passes granularity to repository", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/api/v1/dashboard/trends?granularity=weekly",
            headers: authHeader("admin"),
        });

        expect(res.statusCode).toBe(200);
        expect(mockRepo.fetchTrends).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ granularity: "weekly" })
        );
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/dashboard/recent
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/v1/dashboard/recent", () => {
    let app: Awaited<ReturnType<typeof buildTestApp>>["app"];

    beforeAll(async () => ({ app } = await buildTestApp()));
    afterAll(() => app.close());
    beforeEach(() => {
        jest.clearAllMocks();
        (mockCache.get as jest.Mock).mockResolvedValue(null);
        mockRecentResponse();
    });

    it("200 — returns recent activity with user info", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/api/v1/dashboard/recent",
            headers: authHeader("viewer"),
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body) as {
            data: Array<{ createdBy: { firstName: string }; amount: string }>;
        };

        expect(body.data[0]?.createdBy.firstName).toBe("Alice");
        expect(body.data[0]?.amount).toBe("1500.00");
    });

    it("400 — rejects limit above 50", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/api/v1/dashboard/recent?limit=51",
            headers: authHeader("admin"),
        });

        expect(res.statusCode).toBe(400);
        assertError(JSON.parse(res.body), "VALIDATION_ERROR");
    });
});
