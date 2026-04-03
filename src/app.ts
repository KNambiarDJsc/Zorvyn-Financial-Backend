import Fastify, { FastifyInstance } from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import compress from "@fastify/compress";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";

import { env, corsOrigins, isDev } from "./config/env";
import { getRedis } from "./config/redis";
import { pingDB } from "./config/db";
import { pingRedis } from "./config/redis";
import { logger } from "./utils/logger";
import { isAppError } from "./utils/errors";
import { errorResponse } from "./utils/response";

export async function buildApp(): Promise<FastifyInstance> {
    const app = Fastify({
        logger,
        // Expose request ID in logs for tracing
        genReqId: () => crypto.randomUUID(),
        requestIdHeader: "x-request-id",
        requestIdLogLabel: "requestId",
        // Protects against large malicious payloads
        bodyLimit: 1_048_576, // 1MB
        // Faster JSON stringify via Fastify's schema compiler
        ajv: {
            customOptions: {
                removeAdditional: true,    // strip unknown fields
                coerceTypes: "array",
                useDefaults: true,
            },
        },
    });

    // ── Security ───────────────────────────────────────────────────────────────
    await app.register(helmet, {
        contentSecurityPolicy: isDev ? false : undefined,
    });

    await app.register(cors, {
        origin: corsOrigins,
        credentials: true,
        methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "Idempotency-Key",
            "X-Request-Id",
        ],
    });

    // ── Compression ────────────────────────────────────────────────────────────
    await app.register(compress, {
        global: true,
        threshold: 1024, // only compress responses > 1KB
    });

    // ── Rate Limiting (Redis-backed — works across cluster workers) ────────────
    await app.register(rateLimit, {
        redis: getRedis(),
        max: env.RATE_LIMIT_MAX,
        timeWindow: env.RATE_LIMIT_WINDOW_MS,
        keyGenerator: (request) => {
            // Rate limit by authenticated user if available, else by IP
            return (request.user?.userId ?? request.ip) as string;
        },
        errorResponseBuilder: () => ({
            success: false,
            error: {
                code: "RATE_LIMITED",
                message: "Too many requests — please slow down",
            },
        }),
    });

    // ── OpenAPI / Swagger Docs ─────────────────────────────────────────────────
    await app.register(swagger, {
        openapi: {
            openapi: "3.0.3",
            info: {
                title: "Zorvyn Financial API",
                description:
                    "Production-grade multi-tenant financial data system with RBAC",
                version: "1.0.0",
                contact: { name: "Zorvyn Engineering" },
            },
            servers: [{ url: `http://localhost:${env.PORT}`, description: "Local" }],
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: "http",
                        scheme: "bearer",
                        bearerFormat: "JWT",
                    },
                },
            },
            security: [{ bearerAuth: [] }],
            tags: [
                { name: "Auth", description: "Authentication & token management" },
                { name: "Users", description: "User & role management" },
                { name: "Records", description: "Financial records CRUD" },
                { name: "Dashboard", description: "Analytics & summary APIs" },
                { name: "Health", description: "System health checks" },
            ],
        },
    });

    await app.register(swaggerUI, {
        routePrefix: "/docs",
        uiConfig: { docExpansion: "list", deepLinking: true },
    });

    // ── Global Error Handler ───────────────────────────────────────────────────
    app.setErrorHandler((error, request, reply) => {
        // Log all errors with request context
        request.log.error(
            { err: error, requestId: request.id },
            "Request error"
        );

        // Known application errors — safe to expose to client
        if (isAppError(error)) {
            return reply
                .status(error.statusCode)
                .send(errorResponse(error.code, error.message, error.details));
        }

        // Fastify validation errors (from AJV schema)
        if (error.validation) {
            return reply.status(400).send(
                errorResponse("VALIDATION_ERROR", "Invalid request data", error.validation)
            );
        }

        // JWT errors
        if (
            error.message?.includes("jwt") ||
            error.message?.includes("JsonWebToken")
        ) {
            return reply
                .status(401)
                .send(errorResponse("UNAUTHORIZED", "Invalid or expired token"));
        }

        // Rate limit (handled by plugin but belt-and-suspenders)
        if (error.statusCode === 429) {
            return reply
                .status(429)
                .send(errorResponse("RATE_LIMITED", "Too many requests"));
        }

        // Unknown errors — never leak internals to client
        return reply
            .status(500)
            .send(errorResponse("INTERNAL_ERROR", "An unexpected error occurred"));
    });

    // ── 404 Handler ───────────────────────────────────────────────────────────
    app.setNotFoundHandler((request, reply) => {
        reply.status(404).send(
            errorResponse(
                "NOT_FOUND",
                `Route ${request.method} ${request.url} not found`
            )
        );
    });

    // ── Health Routes ─────────────────────────────────────────────────────────
    await app.register(healthRoutes, { prefix: "" });

    return app;
}

// ─── Health Routes ────────────────────────────────────────────────────────────

async function healthRoutes(app: FastifyInstance): Promise<void> {
    /**
     * GET /health
     * Liveness probe — is the process alive?
     * Load balancers hit this. Must respond instantly (no DB calls).
     */
    app.get(
        "/health",
        {
            schema: {
                tags: ["Health"],
                summary: "Liveness probe",
                response: {
                    200: {
                        type: "object",
                        properties: {
                            status: { type: "string" },
                            uptime: { type: "number" },
                            timestamp: { type: "string" },
                        },
                    },
                },
            },
        },
        async (_req, reply) => {
            reply.send({
                status: "ok",
                uptime: process.uptime(),
                timestamp: new Date().toISOString(),
            });
        }
    );

    /**
     * GET /ready
     * Readiness probe — is the app ready to serve traffic?
     * Checks DB + Redis connectivity. Kubernetes uses this before
     * routing traffic to the pod.
     */
    app.get(
        "/ready",
        {
            schema: {
                tags: ["Health"],
                summary: "Readiness probe",
                response: {
                    200: { type: "object" },
                    503: { type: "object" },
                },
            },
        },
        async (_req, reply) => {
            const [dbOk, redisOk] = await Promise.all([pingDB(), pingRedis()]);

            const status = {
                status: dbOk && redisOk ? "ready" : "degraded",
                checks: {
                    database: dbOk ? "ok" : "unreachable",
                    redis: redisOk ? "ok" : "unreachable",
                },
                timestamp: new Date().toISOString(),
            };

            reply.status(dbOk && redisOk ? 200 : 503).send(status);
        }
    );
}