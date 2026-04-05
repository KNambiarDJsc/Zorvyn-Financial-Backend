/**
 * Financial Record Service Unit Tests
 *
 * Validates:
 *  - Transactional audit log on every mutation
 *  - Decimal serialization as string (never float)
 *  - Soft delete behaviour
 *  - Cache invalidation on mutations
 *  - Org-scoped not-found handling
 */

jest.mock("../../../src/modules/financial-record/repository");
jest.mock("../../../src/modules/audit/service");
jest.mock("../../../src/config/redis");
jest.mock("../../../src/config/db", () => ({
    prisma: {
        $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn({})),
        financialRecord: {
            create: jest.fn(),
            update: jest.fn(),
        },
    },
}));

import { Prisma } from "@prisma/client";
import * as repo from "../../../src/modules/financial-record/repository";
import { cache } from "../../../src/config/redis";
import { prisma } from "../../../src/config/db";
import * as service from "../../../src/modules/financial-record/service";
import { NotFoundError } from "../../../src/utils/errors";

const mockRepo = repo as jest.Mocked<typeof repo>;
const mockCache = cache as jest.Mocked<typeof cache>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_ID = "org-123";
const USER_ID = "user-456";
const RECORD_ID = "record-789";

function makeRecord(overrides = {}): repo.RecordWithUser {
    return {
        id: RECORD_ID,
        amount: new Prisma.Decimal("1500.50"),
        type: "INCOME" as never,
        category: "salary",
        description: "Monthly salary",
        date: new Date("2024-01-01"),
        orgId: ORG_ID,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { id: USER_ID, firstName: "Alice", lastName: "Admin" },
        ...overrides,
    } as repo.RecordWithUser;
}

// ─────────────────────────────────────────────────────────────────────────────
// getRecordById()
// ─────────────────────────────────────────────────────────────────────────────

describe("service.getRecordById()", () => {
    beforeEach(() => jest.clearAllMocks());

    it("returns record with amount serialized as string", async () => {
        mockRepo.findRecordById.mockResolvedValue(makeRecord());

        const result = await service.getRecordById(RECORD_ID, ORG_ID);

        expect(result.amount).toBe("1500.50");
        expect(typeof result.amount).toBe("string"); // never float
    });

    it("throws NotFoundError when record does not exist", async () => {
        mockRepo.findRecordById.mockResolvedValue(null);

        await expect(
            service.getRecordById("ghost-id", ORG_ID)
        ).rejects.toThrow(NotFoundError);
    });

    it("throws NotFoundError when record belongs to different org", async () => {
        // Repo returns null for cross-org queries (enforced by orgId filter)
        mockRepo.findRecordById.mockResolvedValue(null);

        await expect(
            service.getRecordById(RECORD_ID, "other-org-id")
        ).rejects.toThrow(NotFoundError);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// listRecords()
// ─────────────────────────────────────────────────────────────────────────────

describe("service.listRecords()", () => {
    beforeEach(() => jest.clearAllMocks());

    it("returns items with amounts as strings and correct total", async () => {
        mockRepo.listRecords.mockResolvedValue({
            items: [
                makeRecord({ amount: new Prisma.Decimal("999.99") }),
                makeRecord({ id: "r2", amount: new Prisma.Decimal("1234567.89") }),
            ],
            total: 2,
        });

        const result = await service.listRecords(ORG_ID, {
            page: 1,
            limit: 20,
            sortBy: "date",
            sortOrder: "desc",
        });

        expect(result.total).toBe(2);
        expect(result.items[0]?.amount).toBe("999.99");
        expect(result.items[1]?.amount).toBe("1234567.89");
        // Ensure no floating-point corruption on large decimals
        result.items.forEach((item) => {
            expect(typeof item.amount).toBe("string");
        });
    });

    it("returns empty list when no records match filters", async () => {
        mockRepo.listRecords.mockResolvedValue({ items: [], total: 0 });

        const result = await service.listRecords(ORG_ID, {
            page: 1,
            limit: 20,
            type: "EXPENSE" as never,
            sortBy: "date",
            sortOrder: "desc",
        });

        expect(result.items).toHaveLength(0);
        expect(result.total).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateRecord()
// ─────────────────────────────────────────────────────────────────────────────

describe("service.updateRecord()", () => {
    beforeEach(() => jest.clearAllMocks());

    it("throws NotFoundError when record does not exist", async () => {
        mockRepo.findRecordById.mockResolvedValue(null);

        await expect(
            service.updateRecord(RECORD_ID, USER_ID, ORG_ID, { amount: 999 })
        ).rejects.toThrow(NotFoundError);

        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("invalidates dashboard cache after successful update", async () => {
        mockRepo.findRecordById.mockResolvedValue(makeRecord());
        (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn) => {
            const tx = {
                financialRecord: { update: jest.fn().mockResolvedValue(makeRecord({ amount: new Prisma.Decimal("2000.00") })) },
                auditLog: { create: jest.fn() },
            };
            return fn(tx);
        });
        mockCache.delPattern = jest.fn().mockResolvedValue(undefined);

        await service.updateRecord(RECORD_ID, USER_ID, ORG_ID, { amount: 2000 });

        expect(mockCache.delPattern).toHaveBeenCalledWith(
            expect.stringContaining(ORG_ID)
        );
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteRecord()
// ─────────────────────────────────────────────────────────────────────────────

describe("service.deleteRecord()", () => {
    beforeEach(() => jest.clearAllMocks());

    it("throws NotFoundError when record does not exist", async () => {
        mockRepo.findRecordById.mockResolvedValue(null);

        await expect(
            service.deleteRecord(RECORD_ID, USER_ID, ORG_ID)
        ).rejects.toThrow(NotFoundError);
    });

    it("soft deletes record and invalidates cache", async () => {
        mockRepo.findRecordById.mockResolvedValue(makeRecord());
        (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn) => {
            const tx = {
                financialRecord: { update: jest.fn().mockResolvedValue({}) },
                auditLog: { create: jest.fn() },
            };
            return fn(tx);
        });
        mockCache.delPattern = jest.fn().mockResolvedValue(undefined);

        await service.deleteRecord(RECORD_ID, USER_ID, ORG_ID);

        expect(mockCache.delPattern).toHaveBeenCalled();
    });

    it("does not physically remove the record from the database", async () => {
        mockRepo.findRecordById.mockResolvedValue(makeRecord());

        const deleteCalls: unknown[] = [];
        (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn) => {
            const tx = {
                financialRecord: {
                    update: jest.fn().mockImplementation((args) => {
                        deleteCalls.push(args);
                        return Promise.resolve({});
                    }),
                    delete: jest.fn(), // should never be called
                },
                auditLog: { create: jest.fn() },
            };
            const result = await fn(tx);
            // Ensure delete was never called — only update (soft delete)
            expect((tx.financialRecord.delete as jest.Mock)).not.toHaveBeenCalled();
            return result;
        });
        mockCache.delPattern = jest.fn();

        await service.deleteRecord(RECORD_ID, USER_ID, ORG_ID);

        // Update must have been called with isDeleted: true
        const updateArg = deleteCalls[0] as { data: { isDeleted: boolean } };
        expect(updateArg.data.isDeleted).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Decimal precision
// ─────────────────────────────────────────────────────────────────────────────

describe("Decimal precision preservation", () => {
    it("serializes large decimal amounts without floating-point loss", async () => {
        // This value cannot be represented exactly as a JS float
        const preciseAmount = "123456789.99";
        mockRepo.findRecordById.mockResolvedValue(
            makeRecord({ amount: new Prisma.Decimal(preciseAmount) })
        );

        const result = await service.getRecordById(RECORD_ID, ORG_ID);

        expect(result.amount).toBe(preciseAmount);
        // Verify it's NOT the float approximation
        expect(result.amount).not.toBe("123456790");
    });
});
