/**
 * Auth Routes
 *
 * Registers all /api/v1/auth/* endpoints.
 * Each route declares its OpenAPI schema inline — swagger docs
 * are generated automatically from these.
 *
 * Idempotency hooks are applied to POST /register so network
 * retries don't create duplicate users.
 */

import { FastifyInstance } from "fastify";
import { idempotencyCheck, idempotencyStore } from "../../middleware/idempotency.middleware";
import * as controller from "./controller";

export async function authRoutes(app: FastifyInstance): Promise<void> {
    // ── POST /register ────────────────────────────────────────────────────────
    app.post(
        "/register",
        {
            schema: {
                tags: ["Auth"],
                summary: "Register a new user",
                description:
                    "Creates a new user. If `orgName` is provided, a new organisation is created and the user becomes its ADMIN. If `orgId` is provided, the user is added to an existing organisation as VIEWER.",
                body: {
                    type: "object",
                    required: ["email", "password", "firstName", "lastName"],
                    properties: {
                        email: { type: "string", format: "email", example: "alice@example.com" },
                        password: { type: "string", minLength: 8, example: "Secure123!" },
                        firstName: { type: "string", example: "Alice" },
                        lastName: { type: "string", example: "Smith" },
                        orgName: { type: "string", example: "Acme Corp" },
                        orgId: { type: "string", format: "uuid" },
                    },
                },
                response: {
                    201: { description: "User registered successfully", type: "object" },
                    400: { description: "Validation error" },
                    409: { description: "Email already in use" },
                },
            },
            onRequest: [idempotencyCheck],
            onSend: [idempotencyStore],
        },
        controller.registerHandler
    );

    // ── POST /login ───────────────────────────────────────────────────────────
    app.post(
        "/login",
        {
            config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
            schema: {
                tags: ["Auth"],
                summary: "Login",
                description: "Authenticates a user and returns an access + refresh token pair.",
                body: {
                    type: "object",
                    required: ["email", "password"],
                    properties: {
                        email: { type: "string", format: "email", example: "admin@zorvyn.com" },
                        password: { type: "string", example: "Password123!" },
                    },
                },
                response: {
                    200: { description: "Login successful", type: "object" },
                    401: { description: "Invalid credentials" },
                },
            },
        },
        controller.loginHandler
    );

    // ── POST /refresh ─────────────────────────────────────────────────────────
    app.post(
        "/refresh",
        {
            schema: {
                tags: ["Auth"],
                summary: "Refresh access token",
                description:
                    "Exchanges a valid refresh token for a new access + refresh token pair. The old refresh token is invalidated (rotation).",
                body: {
                    type: "object",
                    required: ["refreshToken"],
                    properties: { refreshToken: { type: "string" } },
                },
                response: {
                    200: { description: "Tokens refreshed", type: "object" },
                    401: { description: "Invalid or expired refresh token" },
                },
            },
        },
        controller.refreshHandler
    );

    // ── POST /logout ──────────────────────────────────────────────────────────
    app.post(
        "/logout",
        {
            schema: {
                tags: ["Auth"],
                summary: "Logout",
                description:
                    "Revokes the provided refresh token. Always returns 200 — logout should never fail from the client's perspective.",
                security: [{ bearerAuth: [] }],
                body: {
                    type: "object",
                    required: ["refreshToken"],
                    properties: { refreshToken: { type: "string" } },
                },
                response: { 200: { description: "Logged out successfully", type: "object" } },
            },
        },
        controller.logoutHandler
    );
}
