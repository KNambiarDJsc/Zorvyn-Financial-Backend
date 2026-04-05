import Fastify, { FastifyInstance } from "fastify";
import { registerRoutes } from "../../src/routes";
import { isAppError } from "../../src/utils/errors";
import { errorResponse } from "../../src/utils/response";


export const TEST_ORG_ID = "00000000-0000-0000-0000-000000000001";
export const TEST_ORG_NAME = "Test Corp";

export const TEST_USERS = {
    admin: {
        id: "00000000-0000-0000-0000-000000000010",
        email: "admin@test.com",
        password: "Admin123!",
        role: "ADMIN",
        orgId: TEST_ORG_ID,
    },
    analyst: {
        id: "00000000-0000-0000-0000-000000000011",
        email: "analyst@test.com",
        password: "Analyst123!",
        role: "ANALYST",
        orgId: TEST_ORG_ID,
    },
    viewer: {
        id: "00000000-0000-0000-0000-000000000012",
        email: "viewer@test.com",
        password: "Viewer123!",
        role: "VIEWER",
        orgId: TEST_ORG_ID,
    },
} as const;

export type UserRole = keyof typeof TEST_USERS;

// ─── Build isolated test app ──────────────────────────────────────────────────

export async function buildTestApp(): Promise<{
    app: FastifyInstance;
    inject: FastifyInstance["inject"];
}> {
    const app = Fastify({ logger: false });

    // Minimal plugin set for integration tests — no rate limit, no compress
    await app.register(require("@fastify/helmet"));

    // Global error handler — mirrors production app
    app.setErrorHandler((error, _request, reply) => {
        if (isAppError(error)) {
            return reply
                .status(error.statusCode)
                .send(errorResponse(error.code, error.message, error.details));
        }
        if (error.validation) {
            return reply
                .status(400)
                .send(errorResponse("VALIDATION_ERROR", "Invalid request data", error.validation));
        }
        return reply
            .status(500)
            .send(errorResponse("INTERNAL_ERROR", "Unexpected error"));
    });

    await registerRoutes(app);
    await app.ready();

    return { app, inject: app.inject.bind(app) };
}

// ─── Auth token helpers ───────────────────────────────────────────────────────

import { signAccessToken } from "../../src/utils/jwt";

/**
 * Returns a valid access token for the given test user.
 * Bypasses the login endpoint — faster and no DB dependency.
 */
export function tokenFor(role: UserRole): string {
    const user = TEST_USERS[role];
    return signAccessToken({
        userId: user.id,
        orgId: user.orgId,
        role: user.role,
    });
}

export function authHeader(role: UserRole): Record<string, string> {
    return { authorization: `Bearer ${tokenFor(role)}` };
}

// ─── Response assertion helpers ───────────────────────────────────────────────

export function assertSuccess(body: unknown): asserts body is { success: true; data: unknown } {
    const b = body as { success: boolean };
    if (!b.success) {
        throw new Error(`Expected success response, got: ${JSON.stringify(body)}`);
    }
}

export function assertError(
    body: unknown,
    expectedCode?: string
): asserts body is { success: false; error: { code: string; message: string } } {
    const b = body as { success: boolean; error?: { code: string } };
    if (b.success) {
        throw new Error(`Expected error response, got: ${JSON.stringify(body)}`);
    }
    if (expectedCode && b.error?.code !== expectedCode) {
        throw new Error(
            `Expected error code ${expectedCode}, got: ${b.error?.code}`
        );
    }
}
