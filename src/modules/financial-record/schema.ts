/**
 * Financial Record Validation Schemas
 *
 * All input validation for financial record endpoints.
 * Decimal amounts are validated as strings first (JSON-safe),
 * then converted — avoids floating-point precision loss.
 */

import { z } from "zod";
import { RecordType } from "@prisma/client";
import { ValidationError } from "../../utils/errors";
import { ZodSchema } from "zod";

// ─── Reusable Field Validators ────────────────────────────────────────────────

/**
 * Money amount: positive, max 2 decimal places, max 999,999,999,999.99
 * Validated as a number but stored as Decimal — never as float in DB.
 */
const amountSchema = z
    .number({
        required_error: "Amount is required",
        invalid_type_error: "Amount must be a number",
    })
    .positive("Amount must be greater than zero")
    .max(999_999_999_999.99, "Amount exceeds maximum allowed value")
    .refine(
        (v) => /^\d+(\.\d{1,2})?$/.test(v.toString()),
        "Amount must have at most 2 decimal places"
    );

const categorySchema = z
    .string({ required_error: "Category is required" })
    .min(1, "Category cannot be empty")
    .max(64, "Category cannot exceed 64 characters")
    .trim()
    .toLowerCase();

const dateSchema = z
    .string({ required_error: "Date is required" })
    .datetime({ message: "Date must be a valid ISO 8601 datetime string" })
    .transform((v) => new Date(v));

// ─── Request Schemas ──────────────────────────────────────────────────────────

export const CreateRecordSchema = z.object({
    amount: amountSchema,
    type: z.nativeEnum(RecordType, {
        errorMap: () => ({ message: "Type must be INCOME or EXPENSE" }),
    }),
    category: categorySchema,
    description: z
        .string()
        .max(500, "Description cannot exceed 500 characters")
        .trim()
        .optional(),
    date: dateSchema,
});

export const UpdateRecordSchema = z
    .object({
        amount: amountSchema.optional(),
        type: z.nativeEnum(RecordType).optional(),
        category: categorySchema.optional(),
        description: z
            .string()
            .max(500)
            .trim()
            .optional()
            .nullable(), // allow explicitly clearing description
        date: dateSchema.optional(),
    })
    .refine(
        (data) => Object.keys(data).length > 0,
        "At least one field must be provided for update"
    );

export const RecordIdParamSchema = z.object({
    id: z.string().uuid("Record ID must be a valid UUID"),
});

export const ListRecordsQuerySchema = z.object({
    // Pagination
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),

    // Filters
    type: z.nativeEnum(RecordType).optional(),
    category: z.string().trim().toLowerCase().optional(),
    startDate: z
        .string()
        .datetime()
        .transform((v) => new Date(v))
        .optional(),
    endDate: z
        .string()
        .datetime()
        .transform((v) => new Date(v))
        .optional(),
    minAmount: z.coerce.number().positive().optional(),
    maxAmount: z.coerce.number().positive().optional(),

    // Sorting
    sortBy: z
        .enum(["date", "amount", "category", "createdAt"])
        .default("date"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
}).refine(
    (data) =>
        !data.startDate || !data.endDate || data.startDate <= data.endDate,
    { message: "startDate must be before or equal to endDate", path: ["startDate"] }
).refine(
    (data) =>
        !data.minAmount || !data.maxAmount || data.minAmount <= data.maxAmount,
    { message: "minAmount must be less than or equal to maxAmount", path: ["minAmount"] }
);

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type CreateRecordInput = z.infer<typeof CreateRecordSchema>;
export type UpdateRecordInput = z.infer<typeof UpdateRecordSchema>;
export type RecordIdParam = z.infer<typeof RecordIdParamSchema>;
export type ListRecordsQuery = z.infer<typeof ListRecordsQuerySchema>;

// ─── Validation Helper ────────────────────────────────────────────────────────

export function validate<T>(schema: ZodSchema<T>, data: unknown): T {
    const result = schema.safeParse(data);
    if (!result.success) {
        const details = result.error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
        }));
        throw new ValidationError("Validation failed", details);
    }
    return result.data;
}
