/**
 * Financial Record Schema Tests
 *
 * Tests edge cases that matter for a financial system:
 *  - Amount precision validation
 *  - Date range cross-field validation
 *  - Amount range cross-field validation
 */

import {
    CreateRecordSchema,
    UpdateRecordSchema,
    ListRecordsQuerySchema,
    validate,
} from "../../../src/modules/financial-record/schema";
import { ValidationError } from "../../../src/utils/errors";

const validCreate = {
    amount: 1500.50,
    type: "INCOME",
    category: "salary",
    date: "2024-01-15T00:00:00.000Z",
};

// ─────────────────────────────────────────────────────────────────────────────
// CreateRecordSchema
// ─────────────────────────────────────────────────────────────────────────────

describe("CreateRecordSchema", () => {
    it("accepts valid income record", () => {
        const result = validate(CreateRecordSchema, validCreate);
        expect(result.amount).toBe(1500.50);
        expect(result.category).toBe("salary");
    });

    it("normalizes category to lowercase", () => {
        const result = validate(CreateRecordSchema, { ...validCreate, category: "SALARY" });
        expect(result.category).toBe("salary");
    });

    it("rejects negative amount", () => {
        expect(() =>
            validate(CreateRecordSchema, { ...validCreate, amount: -100 })
        ).toThrow(ValidationError);
    });

    it("rejects zero amount", () => {
        expect(() =>
            validate(CreateRecordSchema, { ...validCreate, amount: 0 })
        ).toThrow(ValidationError);
    });

    it("rejects amount exceeding maximum", () => {
        expect(() =>
            validate(CreateRecordSchema, { ...validCreate, amount: 1_000_000_000_000 })
        ).toThrow(ValidationError);
    });

    it("rejects more than 2 decimal places", () => {
        expect(() =>
            validate(CreateRecordSchema, { ...validCreate, amount: 10.999 })
        ).toThrow(ValidationError);
    });

    it("rejects invalid record type", () => {
        expect(() =>
            validate(CreateRecordSchema, { ...validCreate, type: "TRANSFER" })
        ).toThrow(ValidationError);
    });

    it("rejects invalid date format", () => {
        expect(() =>
            validate(CreateRecordSchema, { ...validCreate, date: "not-a-date" })
        ).toThrow(ValidationError);
    });

    it("rejects description exceeding 500 characters", () => {
        expect(() =>
            validate(CreateRecordSchema, {
                ...validCreate,
                description: "x".repeat(501),
            })
        ).toThrow(ValidationError);
    });

    it("accepts record without optional description", () => {
        const { description: _d, ...rest } = { ...validCreate, description: undefined };
        expect(() => validate(CreateRecordSchema, rest)).not.toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// UpdateRecordSchema
// ─────────────────────────────────────────────────────────────────────────────

describe("UpdateRecordSchema", () => {
    it("accepts partial update with single field", () => {
        const result = validate(UpdateRecordSchema, { amount: 2000 });
        expect(result.amount).toBe(2000);
    });

    it("accepts explicitly setting description to null (clearing it)", () => {
        const result = validate(UpdateRecordSchema, { description: null });
        expect(result.description).toBeNull();
    });

    it("rejects empty object — at least one field required", () => {
        expect(() => validate(UpdateRecordSchema, {})).toThrow(ValidationError);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ListRecordsQuerySchema — cross-field validation
// ─────────────────────────────────────────────────────────────────────────────

describe("ListRecordsQuerySchema — date range validation", () => {
    const base = { page: 1, limit: 20 };

    it("accepts valid date range", () => {
        expect(() =>
            validate(ListRecordsQuerySchema, {
                ...base,
                startDate: "2024-01-01T00:00:00.000Z",
                endDate: "2024-12-31T00:00:00.000Z",
            })
        ).not.toThrow();
    });

    it("rejects startDate after endDate", () => {
        expect(() =>
            validate(ListRecordsQuerySchema, {
                ...base,
                startDate: "2024-12-31T00:00:00.000Z",
                endDate: "2024-01-01T00:00:00.000Z",
            })
        ).toThrow(ValidationError);
    });

    it("accepts same startDate and endDate (single day query)", () => {
        expect(() =>
            validate(ListRecordsQuerySchema, {
                ...base,
                startDate: "2024-06-15T00:00:00.000Z",
                endDate: "2024-06-15T00:00:00.000Z",
            })
        ).not.toThrow();
    });

    it("accepts only startDate without endDate", () => {
        expect(() =>
            validate(ListRecordsQuerySchema, {
                ...base,
                startDate: "2024-01-01T00:00:00.000Z",
            })
        ).not.toThrow();
    });
});

describe("ListRecordsQuerySchema — amount range validation", () => {
    const base = { page: 1, limit: 20 };

    it("rejects minAmount greater than maxAmount", () => {
        expect(() =>
            validate(ListRecordsQuerySchema, {
                ...base,
                minAmount: 5000,
                maxAmount: 100,
            })
        ).toThrow(ValidationError);
    });

    it("accepts equal minAmount and maxAmount (exact amount query)", () => {
        expect(() =>
            validate(ListRecordsQuerySchema, {
                ...base,
                minAmount: 1500,
                maxAmount: 1500,
            })
        ).not.toThrow();
    });
});

describe("ListRecordsQuerySchema — defaults", () => {
    it("applies default pagination and sorting", () => {
        const result = validate(ListRecordsQuerySchema, {});
        expect(result.page).toBe(1);
        expect(result.limit).toBe(20);
        expect(result.sortBy).toBe("date");
        expect(result.sortOrder).toBe("desc");
    });

    it("coerces string page/limit from query string", () => {
        const result = validate(ListRecordsQuerySchema, { page: "2", limit: "50" });
        expect(result.page).toBe(2);
        expect(result.limit).toBe(50);
    });

    it("rejects limit above 100", () => {
        expect(() =>
            validate(ListRecordsQuerySchema, { limit: 101 })
        ).toThrow(ValidationError);
    });
});
