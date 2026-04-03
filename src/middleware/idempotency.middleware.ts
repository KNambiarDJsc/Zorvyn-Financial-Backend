

import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../config/db";
import { idempotencyExpiresAt } from "../utils/jwt";

const IDEMPOTENCY_HEADER = "idempotency-key";

// Attach key to request for use in onSend hook
declare module "fastify" {
    interface FastifyRequest {
        idempotencyKey?: string;
    }
}

/**
 * onRequest hook — check for existing idempotency key and replay if found.
 */
export async function idempotencyCheck(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    // Only applies to POST requests with the header
    if (request.method !== "POST") return;

    const key = request.headers[IDEMPOTENCY_HEADER] as string | undefined;
    if (!key) return;

    // Validate UUID format
    const UUID_RE =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(key)) {
        reply.status(400).send({
            success: false,
            error: {
                code: "VALIDATION_ERROR",
                message: "Idempotency-Key must be a valid UUID v4",
            },
        });
        return;
    }

    request.idempotencyKey = key;

    if (!request.user) return; // can only scope to user after auth

    const existing = await prisma.idempotencyKey.findFirst({
        where: {
            key,
            userId: request.user.userId,
            expiresAt: { gt: new Date() },
        },
    });

    if (existing) {
        // Replay the stored response — idempotent!
        reply
            .status(existing.statusCode)
            .header("X-Idempotency-Replay", "true")
            .send(existing.response);
    }
}

/**
 * onSend hook — store the response for future replays.
 */
export async function idempotencyStore(
    request: FastifyRequest,
    _reply: FastifyReply,
    payload: unknown
): Promise<unknown> {
    if (
        request.method !== "POST" ||
        !request.idempotencyKey ||
        !request.user
    ) {
        return payload;
    }

    try {
        const statusCode = _reply.statusCode;

        // Only cache successful responses
        if (statusCode >= 200 && statusCode < 300) {
            const responseBody =
                typeof payload === "string" ? JSON.parse(payload) : payload;

            await prisma.idempotencyKey.upsert({
                where: { key: request.idempotencyKey },
                update: {},
                create: {
                    key: request.idempotencyKey,
                    userId: request.user.userId,
                    statusCode,
                    response: responseBody as object,
                    expiresAt: idempotencyExpiresAt(),
                },
            });
        }
    } catch {
        // Non-fatal — log and move on, don't fail the response
        request.log.warn(
            { key: request.idempotencyKey },
            "Failed to store idempotency key"
        );
    }

    return payload;
}
