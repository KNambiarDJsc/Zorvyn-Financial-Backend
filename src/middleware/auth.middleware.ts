/**
 * Authentication Middleware
 *
 * Verifies the Bearer JWT on every protected route.
 * On success: populates req.user = { userId, orgId, role }
 * On failure: returns 401 immediately — request never reaches handler.
 *
 * Usage in routes:
 *   fastify.addHook("onRequest", authenticate)
 */

import { FastifyRequest, FastifyReply } from "fastify";
import { RoleName } from "@prisma/client";
import { verifyAccessToken } from "../utils/jwt";
import { UnauthorizedError } from "../utils/errors";

export async function authenticate(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        reply
            .status(401)
            .send({
                success: false,
                error: { code: "UNAUTHORIZED", message: "Missing or malformed Authorization header" },
            });
        return;
    }

    const token = authHeader.slice(7); // strip "Bearer "

    try {
        const payload = verifyAccessToken(token);

        // Validate role is a known enum value — guards against tampered tokens
        if (!Object.values(RoleName).includes(payload.role as RoleName)) {
            throw new UnauthorizedError("Invalid role in token");
        }

        request.user = {
            userId: payload.userId,
            orgId: payload.orgId,
            role: payload.role as RoleName,
        };
    } catch {
        reply.status(401).send({
            success: false,
            error: { code: "UNAUTHORIZED", message: "Invalid or expired access token" },
        });
    }
}
