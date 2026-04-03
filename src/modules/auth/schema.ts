/**
 * Auth Validation Schemas
 *
 * Zod schemas are the single source of truth for:
 *  - Runtime input validation
 *  - TypeScript type inference (no duplicate type definitions)
 *  - OpenAPI schema generation
 *
 * Password policy: min 8 chars, at least one uppercase,
 * one lowercase, one digit, one special character.
 */

import { z } from "zod";

// ─── Reusable Field Validators ────────────────────────────────────────────────

const emailSchema = z
    .string({ required_error: "Email is required" })
    .email("Must be a valid email address")
    .toLowerCase()
    .trim();

const passwordSchema = z
    .string({ required_error: "Password is required" })
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters") // bcrypt truncates at 72
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

const nameSchema = z
    .string()
    .min(1, "Cannot be empty")
    .max(64, "Cannot exceed 64 characters")
    .trim();

// ─── Request Schemas ──────────────────────────────────────────────────────────

export const RegisterSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
    firstName: nameSchema,
    lastName: nameSchema,
    orgName: z
        .string()
        .min(2, "Organisation name must be at least 2 characters")
        .max(128, "Organisation name cannot exceed 128 characters")
        .trim()
        .optional(), // optional — admin can add users to existing orgs
    orgId: z.string().uuid("orgId must be a valid UUID").optional(),
});

export const LoginSchema = z.object({
    email: emailSchema,
    password: z.string({ required_error: "Password is required" }),
});

export const RefreshSchema = z.object({
    refreshToken: z.string({ required_error: "refreshToken is required" }),
});

export const LogoutSchema = z.object({
    refreshToken: z.string({ required_error: "refreshToken is required" }),
});

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type RefreshInput = z.infer<typeof RefreshSchema>;
export type LogoutInput = z.infer<typeof LogoutSchema>;

// ─── Validation Helper ────────────────────────────────────────────────────────

import { ValidationError } from "../../utils/errors";
import { ZodSchema } from "zod";

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
