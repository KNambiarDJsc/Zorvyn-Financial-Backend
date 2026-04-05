/**
 * Auth Schema Validation Tests
 *
 * Validates that the Zod schemas enforce the correct rules
 * and produce readable error messages.
 */

import { RegisterSchema, LoginSchema, validate } from "../../../src/modules/auth/schema";
import { ValidationError } from "../../../src/utils/errors";

describe("RegisterSchema", () => {
    const valid = {
        email: "Alice@Example.COM",
        password: "Secure123!",
        firstName: "Alice",
        lastName: "Smith",
        orgName: "Test Corp",
    };

    it("accepts valid input and normalises email to lowercase", () => {
        const result = validate(RegisterSchema, valid);
        expect(result.email).toBe("alice@example.com");
    });

    it("rejects invalid email format", () => {
        expect(() => validate(RegisterSchema, { ...valid, email: "not-an-email" }))
            .toThrow(ValidationError);
    });

    it("rejects password shorter than 8 chars", () => {
        expect(() => validate(RegisterSchema, { ...valid, password: "Short1!" }))
            .toThrow(ValidationError);
    });

    it("rejects password without uppercase letter", () => {
        expect(() => validate(RegisterSchema, { ...valid, password: "nouppercase1!" }))
            .toThrow(ValidationError);
    });

    it("rejects password without a number", () => {
        expect(() => validate(RegisterSchema, { ...valid, password: "NoNumbers!" }))
            .toThrow(ValidationError);
    });

    it("rejects password without a special character", () => {
        expect(() => validate(RegisterSchema, { ...valid, password: "NoSpecial1" }))
            .toThrow(ValidationError);
    });

    it("rejects missing firstName", () => {
        const { firstName: _f, ...rest } = valid;
        expect(() => validate(RegisterSchema, rest)).toThrow(ValidationError);
    });

    it("accepts input without orgName or orgId (service handles the logic)", () => {
        const { orgName: _o, ...rest } = valid;
        expect(() => validate(RegisterSchema, rest)).not.toThrow();
    });
});

describe("LoginSchema", () => {
    it("accepts valid credentials", () => {
        const result = validate(LoginSchema, {
            email: "Alice@Example.COM",
            password: "anything",
        });
        expect(result.email).toBe("alice@example.com");
    });

    it("rejects missing password", () => {
        expect(() => validate(LoginSchema, { email: "alice@example.com" }))
            .toThrow(ValidationError);
    });
});
