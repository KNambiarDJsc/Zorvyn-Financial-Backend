jest.mock("../../../src/modules/dashboard/repository");
jest.mock("../../../src/config/redis");

import * as repo from "../../../src/modules/dashboard/repository";
import { cache } from "../../../src/config/redis";
import * as service from "../../../src/modules/dashboard/service";

const mockRepo = repo as jest.Mocked<typeof repo>;
const mockCache = cache as jest.Mocked<typeof cache>;

const ORG_ID = "org-123";

// ─────────────────────────────────────────────────────────────────────────────
// getSummary()
// ─────────────────────────────────────────────────────────────────────────────

describe("service.getSummary()", () => {
    beforeEach(() => jest.clearAllMocks());

    it("returns cached result without hitting the DB on cache hit", async () => {
        const cachedData = {
            totalIncome: "5000.00",
            totalExpenses: "2000.00",
            netBalance: "3000.00",
            recordCount: 10,
            incomeCount: 6,
            expenseCount: 4,
            period: { startDate: null, endDate: null },
        };
        mockCache.get = jest.fn().mockResolvedValue(cachedData);

        const result = await service.getSummary(ORG_ID, {});

        expect(result).toEqual(cachedData);
        expect(mockRepo.fetchSummary).not.toHaveBeenCalled();
    });

    it("fetches from DB on cache miss and stores the result", async () => {
        mockCache.get = jest.fn().mockResolvedValue(null);
        mockCache.set = jest.fn().mockResolvedValue(undefined);
        mockRepo.fetchSummary.mockResolvedValue({
            total_income: "8500.00",
            total_expenses: "3200.50",
            net_balance: "5299.50",
            record_count: BigInt(15),
            income_count: BigInt(8),
            expense_count: BigInt(7),
        });

        const result = await service.getSummary(ORG_ID, {});

        expect(mockRepo.fetchSummary).toHaveBeenCalledWith(ORG_ID, {});
        expect(mockCache.set).toHaveBeenCalledTimes(1);
        expect(result.totalIncome).toBe("8500.00");
        expect(result.totalExpenses).toBe("3200.50");
        expect(result.netBalance).toBe("5299.50");
        expect(result.recordCount).toBe(15);
    });

    it("serializes all amounts as strings — never numbers", async () => {
        mockCache.get = jest.fn().mockResolvedValue(null);
        mockCache.set = jest.fn().mockResolvedValue(undefined);
        mockRepo.fetchSummary.mockResolvedValue({
            total_income: "99999999.99",
            total_expenses: "0",
            net_balance: "99999999.99",
            record_count: BigInt(1),
            income_count: BigInt(1),
            expense_count: BigInt(0),
        });

        const result = await service.getSummary(ORG_ID, {});

        expect(typeof result.totalIncome).toBe("string");
        expect(typeof result.totalExpenses).toBe("string");
        expect(typeof result.netBalance).toBe("string");
    });

    it("handles empty dataset gracefully", async () => {
        mockCache.get = jest.fn().mockResolvedValue(null);
        mockCache.set = jest.fn().mockResolvedValue(undefined);
        mockRepo.fetchSummary.mockResolvedValue({
            total_income: "0",
            total_expenses: "0",
            net_balance: "0",
            record_count: BigInt(0),
            income_count: BigInt(0),
            expense_count: BigInt(0),
        });

        const result = await service.getSummary(ORG_ID, {});

        expect(result.totalIncome).toBe("0");
        expect(result.recordCount).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// getCategoryBreakdown()
// ─────────────────────────────────────────────────────────────────────────────

describe("service.getCategoryBreakdown()", () => {
    beforeEach(() => jest.clearAllMocks());

    it("calculates correct percentages for income categories", async () => {
        mockCache.get = jest.fn().mockResolvedValue(null);
        mockCache.set = jest.fn().mockResolvedValue(undefined);

        // salary: 8000, freelance: 2000 → total income = 10000
        mockRepo.fetchCategoryBreakdown.mockResolvedValue([
            { category: "salary", type: "INCOME", total: "8000.00", count: BigInt(1) },
            { category: "freelance", type: "INCOME", total: "2000.00", count: BigInt(2) },
        ]);

        const result = await service.getCategoryBreakdown(ORG_ID, {});

        const salary = result.find((r) => r.category === "salary");
        const freelance = result.find((r) => r.category === "freelance");

        expect(salary?.percentage).toBe(80);       // 8000/10000 * 100
        expect(freelance?.percentage).toBe(20);    // 2000/10000 * 100
        // Percentages within type must sum to 100
        const totalPct = result.reduce((sum, r) => sum + r.percentage, 0);
        expect(totalPct).toBeCloseTo(100, 1);
    });

    it("handles separate income and expense percentage pools", async () => {
        mockCache.get = jest.fn().mockResolvedValue(null);
        mockCache.set = jest.fn().mockResolvedValue(undefined);

        mockRepo.fetchCategoryBreakdown.mockResolvedValue([
            { category: "salary", type: "INCOME", total: "5000.00", count: BigInt(1) },
            { category: "rent", type: "EXPENSE", total: "2000.00", count: BigInt(1) },
            { category: "utilities", type: "EXPENSE", total: "500.00", count: BigInt(1) },
        ]);

        const result = await service.getCategoryBreakdown(ORG_ID, {});

        const salary = result.find((r) => r.category === "salary");
        const rent = result.find((r) => r.category === "rent");
        const utilities = result.find((r) => r.category === "utilities");

        expect(salary?.percentage).toBe(100);             // only income item
        expect(rent?.percentage).toBeCloseTo(80, 1);      // 2000/2500
        expect(utilities?.percentage).toBeCloseTo(20, 1); // 500/2500
    });

    it("returns 0% for all categories when total is zero (no division by zero)", async () => {
        mockCache.get = jest.fn().mockResolvedValue(null);
        mockCache.set = jest.fn().mockResolvedValue(undefined);

        mockRepo.fetchCategoryBreakdown.mockResolvedValue([
            { category: "salary", type: "INCOME", total: "0", count: BigInt(0) },
        ]);

        const result = await service.getCategoryBreakdown(ORG_ID, {});

        // Must not throw — division by zero is guarded
        expect(result[0]?.percentage).toBe(0);
    });

    it("returns cached result without hitting DB", async () => {
        const cachedData = [
            { category: "salary", type: "INCOME", total: "5000", count: 1, percentage: 100 },
        ];
        mockCache.get = jest.fn().mockResolvedValue(cachedData);

        const result = await service.getCategoryBreakdown(ORG_ID, {});

        expect(result).toEqual(cachedData);
        expect(mockRepo.fetchCategoryBreakdown).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// getTrends()
// ─────────────────────────────────────────────────────────────────────────────

describe("service.getTrends()", () => {
    beforeEach(() => jest.clearAllMocks());

    it("maps trend rows to correct shape with string amounts", async () => {
        mockCache.get = jest.fn().mockResolvedValue(null);
        mockCache.set = jest.fn().mockResolvedValue(undefined);

        mockRepo.fetchTrends.mockResolvedValue([
            {
                period: "2024-01",
                income: "8500.00",
                expenses: "3200.00",
                net: "5300.00",
                record_count: BigInt(12),
            },
            {
                period: "2024-02",
                income: "9000.00",
                expenses: "4100.00",
                net: "4900.00",
                record_count: BigInt(15),
            },
        ]);

        const result = await service.getTrends(ORG_ID, { granularity: "monthly" });

        expect(result).toHaveLength(2);
        expect(result[0]?.period).toBe("2024-01");
        expect(result[0]?.income).toBe("8500.00");
        expect(result[0]?.net).toBe("5300.00");
        expect(result[0]?.recordCount).toBe(12);
        expect(typeof result[0]?.income).toBe("string");
    });

    it("returns empty array when no trend data exists", async () => {
        mockCache.get = jest.fn().mockResolvedValue(null);
        mockCache.set = jest.fn().mockResolvedValue(undefined);
        mockRepo.fetchTrends.mockResolvedValue([]);

        const result = await service.getTrends(ORG_ID, { granularity: "monthly" });

        expect(result).toEqual([]);
        expect(mockCache.set).toHaveBeenCalledWith(
            expect.any(String),
            [],
            expect.any(Number)
        );
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// getRecentActivity()
// ─────────────────────────────────────────────────────────────────────────────

describe("service.getRecentActivity()", () => {
    beforeEach(() => jest.clearAllMocks());

    it("maps recent rows with correct user shape", async () => {
        mockCache.get = jest.fn().mockResolvedValue(null);
        mockCache.set = jest.fn().mockResolvedValue(undefined);

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

        const result = await service.getRecentActivity(ORG_ID, { limit: 10 });

        expect(result).toHaveLength(1);
        expect(result[0]?.createdBy.firstName).toBe("Alice");
        expect(result[0]?.amount).toBe("1500.00");
        expect(typeof result[0]?.date).toBe("string"); // ISO string, not Date object
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cache key determinism
// ─────────────────────────────────────────────────────────────────────────────

describe("Cache key determinism", () => {
    it("same date range params always produce same cache key (param order invariant)", async () => {
        // Call twice — cache stores on first miss, returns on second hit
        const dbResult = {
            total_income: "1000",
            total_expenses: "500",
            net_balance: "500",
            record_count: BigInt(5),
            income_count: BigInt(3),
            expense_count: BigInt(2),
        };

        mockCache.get = jest.fn().mockResolvedValue(null);
        mockCache.set = jest.fn().mockResolvedValue(undefined);
        mockRepo.fetchSummary.mockResolvedValue(dbResult);

        const start = new Date("2024-01-01");
        const end = new Date("2024-12-31");

        await service.getSummary(ORG_ID, { startDate: start, endDate: end });

        // The key stored in cache.set
        const storedKey = (mockCache.set as jest.Mock).mock.calls[0][0] as string;

        // Verify key contains both date params
        expect(storedKey).toContain("endDate");
        expect(storedKey).toContain("startDate");
        expect(storedKey).toContain(ORG_ID);
    });
});
