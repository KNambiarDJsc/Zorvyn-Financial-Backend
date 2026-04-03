import jwt from "jsonwebtoken";
import { SignOptions } from "jsonwebtoken";
import crypto from "crypto";
import { env } from "../config/env";

// ─── Payload Shapes ───────────────────────────────────────────────────────────

export interface JwtClaims {
    userId: string;
    orgId: string;
    role: string;
}

export interface AccessTokenPayload extends JwtClaims {
    type: "access";
    iat: number;
    exp: number;
    iss: string;
}

export interface RefreshTokenPayload extends JwtClaims {
    type: "refresh";
    iat: number;
    exp: number;
    iss: string;
}

const ISSUER = "zorvyn-api" as const;

// ─── Sign ─────────────────────────────────────────────────────────────────────

export function signAccessToken(claims: JwtClaims): string {
    return jwt.sign(
        { ...claims, type: "access" },
        env.JWT_SECRET,
        {
            expiresIn: env.JWT_ACCESS_EXPIRY as SignOptions["expiresIn"],
            issuer: ISSUER,
        }
    );
}

export function signRefreshToken(claims: JwtClaims): string {
    return jwt.sign(
        { ...claims, type: "refresh" },
        env.JWT_SECRET,
        {
            expiresIn: env.JWT_REFRESH_EXPIRY as SignOptions["expiresIn"],
            issuer: ISSUER,
        }
    );
}

// ─── Verify ───────────────────────────────────────────────────────────────────

export function verifyAccessToken(token: string): AccessTokenPayload {
    const payload = jwt.verify(token, env.JWT_SECRET, { issuer: ISSUER });
    const p = payload as AccessTokenPayload;

    if (p.type !== "access") {
        throw new jwt.JsonWebTokenError("Token type mismatch — expected access token");
    }

    return p;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
    const payload = jwt.verify(token, env.JWT_SECRET, { issuer: ISSUER });
    const p = payload as RefreshTokenPayload;

    if (p.type !== "refresh") {
        throw new jwt.JsonWebTokenError("Token type mismatch — expected refresh token");
    }

    return p;
}

// ─── Hashing ──────────────────────────────────────────────────────────────────

/**
 * Hash a token before DB storage.
 * If the DB is compromised, raw tokens are never exposed.
 */
export function hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
}

// ─── Expiry Helpers ───────────────────────────────────────────────────────────

/** Returns a Date 7 days from now — matches JWT_REFRESH_EXPIRY default */
export function refreshTokenExpiresAt(): Date {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
}

/** Returns a Date 24h from now — used for idempotency key TTL */
export function idempotencyExpiresAt(): Date {
    return new Date(Date.now() + 24 * 60 * 60 * 1000);
}
