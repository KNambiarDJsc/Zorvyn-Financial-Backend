/**
 * Dashboard Query Schemas
 *
 * Date filters are optional — omitting them queries all-time data.
 * Granularity defaults to monthly for trends.
 */

import { z } from "zod";
import { ValidationError } from "../../utils/errors";
import { ZodSchema } from "zod";

const optionalDatetime = z
    .string()
    .datetime({ message: "Must be a valid ISO 8601 datetime" })
    .transform((v) => new Date(v))
    .optional();

// ─── Shared date range ────────────────────────────────────────────────────────

const dateRangeBase = z
    .object({
        startDate: optionalDatetime,
        endDate: optionalDatetime,
    })
    .refine(
        (d) => !d.startDate || !d.endDate || d.startDate <= d.endDate,
        { message: "startDate must be before or equal to endDate", path: ["startDate"] }
    );

// ─── Summary query ────────────────────────────────────────────────────────────

export const SummaryQuerySchema = dateRangeBase;

// ─── Category breakdown query ─────────────────────────────────────────────────

export const CategoryQuerySchema = dateRangeBase.and(
    z.object({
        type: z.enum(["INCOME", "EXPENSE"]).optional(),
    })
);

// ─── Trends query ─────────────────────────────────────────────────────────────

export const TrendsQuerySchema = dateRangeBase.and(
    z.object({
        granularity: z
            .enum(["daily", "weekly", "monthly"])
            .default("monthly"),
        // Default: last 12 months when no dates provided
    })
);

// ─── Recent activity query ────────────────────────────────────────────────────

export const RecentQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).default(10),
});

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type SummaryQuery = z.infer<typeof SummaryQuerySchema>;
export type CategoryQuery = z.infer<typeof CategoryQuerySchema>;
export type TrendsQuery = z.infer<typeof TrendsQuerySchema>;
export type RecentQuery = z.infer<typeof RecentQuerySchema>;

// ─── Validation helper ────────────────────────────────────────────────────────

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
