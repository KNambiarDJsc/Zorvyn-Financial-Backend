/**
 * Auth Service
 *
 * All business logic for authentication lives here.
 * Controllers call services — services call repositories.
 *
 * Rules:
 *  - No Prisma imports here — only repository functions
 *  - No HTTP concepts (no FastifyRequest/Reply)
 *  - Every function is independently testable
 */

import bcrypt from "bcrypt";
import { env } from "../../config/env";
import {
    signAccessToken,
    signRefreshToken,
    verifyRefreshToken,
    hashToken,
    refreshTokenExpiresAt,
} from "../../utils/jwt";
import {
    UnauthorizedError,
    ConflictError,
    NotFoundError,
    ForbiddenError,
} from "../../utils/errors";
import type { RegisterInput, LoginInput, RefreshInput, LogoutInput } from "./schema";
import type { AuthResult, RegisterResult, TokenPair } from "./types";
import * as repo from "./repository";

// ─── Register ─────────────────────────────────────────────────────────────────

export async function register(input: RegisterInput): Promise<RegisterResult> {
    // 1. Ensure email is not already taken
    const existing = await repo.findUserByEmail(input.email);
    if (existing) {
        throw new ConflictError("An account with this email already exists");
    }

    // 2. Hash password — never store plaintext
    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);

    let user: Awaited<ReturnType<typeof repo.createUserWithOrg>>;
    let orgName: string;

    if (input.orgName) {
        // Case A: New user creates a new organisation → becomes ADMIN
        user = await repo.createUserWithOrg({
            email: input.email,
            passwordHash,
            firstName: input.firstName,
            lastName: input.lastName,
            orgName: input.orgName,
        });
        orgName = user.organization.name;
    } else if (input.orgId) {
        // Case B: Adding user to an existing org (called by an admin)
        const org = await repo.findOrgById(input.orgId);
        if (!org) throw new NotFoundError("Organisation not found");

        // Default role for new org members: VIEWER
        const viewerRole = await repo.findRoleByName("VIEWER");
        if (!viewerRole) throw new NotFoundError("Default role not configured");

        const newUser = await repo.createUserForOrg({
            email: input.email,
            passwordHash,
            firstName: input.firstName,
            lastName: input.lastName,
            orgId: input.orgId,
            roleId: viewerRole.id,
        });

        // Reconstruct shape to match createUserWithOrg return
        user = { ...newUser, organization: { name: org.name } } as typeof user;
        orgName = org.name;
    } else {
        throw new ConflictError("Provide either orgName (new org) or orgId (existing org)");
    }

    // 3. Issue token pair
    const tokens = await issueTokenPair({
        userId: user.id,
        orgId: user.orgId,
        role: user.role.name,
    });

    return {
        user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role.name,
            orgId: user.orgId,
            orgName,
        },
        tokens,
    };
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function login(input: LoginInput): Promise<AuthResult> {
    // 1. Find user — use a generic error to prevent user enumeration
    const user = await repo.findUserByEmail(input.email);
    if (!user) {
        throw new UnauthorizedError("Invalid email or password");
    }

    // 2. Check account status before password verification
    //    (avoid leaking which users are suspended vs active)
    if (user.status === "SUSPENDED") {
        throw new ForbiddenError("This account has been suspended. Contact support.");
    }

    if (user.status === "INACTIVE") {
        throw new ForbiddenError("This account is inactive.");
    }

    // 3. Verify password — constant-time comparison via bcrypt
    const passwordValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordValid) {
        throw new UnauthorizedError("Invalid email or password");
    }

    // 4. Update last login timestamp (fire-and-forget — non-critical)
    repo.updateUserLastLogin(user.id).catch(() => {
        // Non-fatal — don't fail login if this update fails
    });

    // 5. Issue token pair
    const tokens = await issueTokenPair({
        userId: user.id,
        orgId: user.orgId,
        role: user.role.name,
    });

    return {
        user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role.name,
            orgId: user.orgId,
        },
        tokens,
    };
}

// ─── Refresh ──────────────────────────────────────────────────────────────────

export async function refresh(input: RefreshInput): Promise<TokenPair> {
    // 1. Verify JWT signature + expiry
    let payload: ReturnType<typeof verifyRefreshToken>;
    try {
        payload = verifyRefreshToken(input.refreshToken);
    } catch {
        throw new UnauthorizedError("Invalid or expired refresh token");
    }

    // 2. Check token exists in DB and is not revoked
    //    (handles logout + token theft scenarios)
    const tokenHash = hashToken(input.refreshToken);
    const storedToken = await repo.findRefreshToken(tokenHash);
    if (!storedToken) {
        // Token not in DB or already revoked — possible replay attack
        // Revoke ALL tokens for this user as a security measure
        await repo.revokeAllUserTokens(payload.userId);
        throw new UnauthorizedError("Refresh token has been revoked or already used");
    }

    // 3. Verify the user still exists and is active
    const user = await repo.findUserById(payload.userId);
    if (!user || user.status !== "ACTIVE") {
        throw new UnauthorizedError("User account is not active");
    }

    // 4. Issue new token pair — rotate refresh token
    const newRefreshToken = signRefreshToken({
        userId: user.id,
        orgId: user.orgId,
        role: user.role.name,
    });
    const newRefreshHash = hashToken(newRefreshToken);

    await repo.rotateRefreshToken(
        tokenHash,
        newRefreshHash,
        user.id,
        refreshTokenExpiresAt()
    );

    const newAccessToken = signAccessToken({
        userId: user.id,
        orgId: user.orgId,
        role: user.role.name,
    });

    return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
    };
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logout(input: LogoutInput): Promise<void> {
    // Revoke the specific refresh token
    // We don't verify the JWT here — just revoke whatever token was sent.
    // This handles expired tokens gracefully (logout should always succeed).
    const tokenHash = hashToken(input.refreshToken);
    await repo.revokeRefreshToken(tokenHash);
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

interface TokenClaims {
    userId: string;
    orgId: string;
    role: string;
}

/**
 * Issue an access + refresh token pair and persist the refresh token hash.
 */
async function issueTokenPair(claims: TokenClaims): Promise<TokenPair> {
    const accessToken = signAccessToken(claims);
    const refreshToken = signRefreshToken(claims);

    // Store hashed refresh token in DB
    await repo.createRefreshToken(
        claims.userId,
        hashToken(refreshToken),
        refreshTokenExpiresAt()
    );

    return { accessToken, refreshToken };
}
