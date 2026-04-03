/**
 * User Module Validation Schemas
 *
 * All input validation for user-related endpoints.
 * Types are inferred from schemas — no duplication.
 */

import { z } from "zod";
import { RoleName, UserStatus } from "@prisma/client";
import { ValidationError } from "../../utils/errors";
import { ZodSchema } from "zod";

// ─── Query Schemas ────────────────────────────────────────────────────────────

export const ListUsersQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    role: z.nativeEnum(RoleName).optional(),
    status: z.nativeEnum(UserStatus).optional(),
    search: z.string().trim().max(100).optional(), // search by name/email
});

// ─── Param Schemas ────────────────────────────────────────────────────────────

export const UserIdParamSchema = z.object({
    id: z.string().uuid("User ID must be a valid UUID"),
});

// ─── Mutation Schemas ─────────────────────────────────────────────────────────

export const UpdateProfileSchema = z.object({
    firstName: z.string().min(1).max(64).trim().optional(),
    lastName: z.string().min(1).max(64).trim().optional(),
});

export const UpdateUserRoleSchema = z.object({
    role: z.nativeEnum(RoleName, {
        errorMap: () => ({
            message: `Role must be one of: ${Object.values(RoleName).join(", ")}`,
        }),
    }),
});

export const UpdateUserStatusSchema = z.object({
    status: z.nativeEnum(UserStatus, {
        errorMap: () => ({
            message: `Status must be one of: ${Object.values(UserStatus).join(", ")}`,
        }),
    }),
});

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;
export type UserIdParam = z.infer<typeof UserIdParamSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
export type UpdateUserRoleInput = z.infer<typeof UpdateUserRoleSchema>;
export type UpdateUserStatusInput = z.infer<typeof UpdateUserStatusSchema>;

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
