/**
 * Auth Repository
 *
 * All database access for the auth module lives here.
 * Services call repositories — never call Prisma directly from services.
 *
 * Rule: NO business logic here. Only DB queries.
 */

import { User, Organization, RefreshToken } from "@prisma/client";
import { prisma } from "../../config/db";

// ─── User Queries ─────────────────────────────────────────────────────────────

export async function findUserByEmail(
    email: string
): Promise<(User & { role: { name: string } }) | null> {
    return prisma.user.findUnique({
        where: { email },
        include: { role: { select: { name: true } } },
    });
}

export async function findUserById(
    userId: string
): Promise<(User & { role: { name: string } }) | null> {
    return prisma.user.findUnique({
        where: { id: userId },
        include: { role: { select: { name: true } } },
    });
}

export async function updateUserLastLogin(userId: string): Promise<void> {
    await prisma.user.update({
        where: { id: userId },
        data: { lastLoginAt: new Date() },
    });
}

// ─── Organisation Queries ─────────────────────────────────────────────────────

export async function findOrgById(
    orgId: string
): Promise<Organization | null> {
    return prisma.organization.findUnique({ where: { id: orgId } });
}

export async function findRoleByName(name: string) {
    return prisma.role.findUnique({ where: { name: name as never } });
}

// ─── User Creation (register flow) ───────────────────────────────────────────

export interface CreateUserWithOrgInput {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    orgName: string;
}

/**
 * Creates a new organisation + admin user atomically.
 * Either both succeed or neither does — no orphaned records.
 */
export async function createUserWithOrg(
    input: CreateUserWithOrgInput
): Promise<User & { role: { name: string }; organization: { name: string } }> {
    return prisma.$transaction(async (tx) => {
        // Create org with URL-safe slug
        const slug = input.orgName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .concat(`-${Date.now()}`); // ensure uniqueness

        const org = await tx.organization.create({
            data: { name: input.orgName, slug },
        });

        // New org's first user is always ADMIN
        const adminRole = await tx.role.findUniqueOrThrow({
            where: { name: "ADMIN" },
        });

        const user = await tx.user.create({
            data: {
                email: input.email,
                passwordHash: input.passwordHash,
                firstName: input.firstName,
                lastName: input.lastName,
                orgId: org.id,
                roleId: adminRole.id,
            },
            include: {
                role: { select: { name: true } },
                organization: { select: { name: true } },
            },
        });

        return user;
    });
}

export interface CreateUserForOrgInput {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    orgId: string;
    roleId: string;
}

/**
 * Creates a user inside an existing organisation.
 * Used by admins adding team members.
 */
export async function createUserForOrg(
    input: CreateUserForOrgInput
): Promise<User & { role: { name: string } }> {
    return prisma.user.create({
        data: input,
        include: { role: { select: { name: true } } },
    });
}

// ─── Refresh Token Queries ────────────────────────────────────────────────────

export async function createRefreshToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date
): Promise<RefreshToken> {
    return prisma.refreshToken.create({
        data: { userId, tokenHash, expiresAt },
    });
}

export async function findRefreshToken(
    tokenHash: string
): Promise<RefreshToken | null> {
    return prisma.refreshToken.findFirst({
        where: {
            tokenHash,
            revoked: false,
            expiresAt: { gt: new Date() },
        },
    });
}

/**
 * Rotate refresh token: revoke old, create new — in a single transaction.
 * This prevents replay attacks where a stolen token is used after rotation.
 */
export async function rotateRefreshToken(
    oldTokenHash: string,
    newTokenHash: string,
    userId: string,
    expiresAt: Date
): Promise<RefreshToken> {
    return prisma.$transaction(async (tx) => {
        // Revoke old token
        await tx.refreshToken.updateMany({
            where: { tokenHash: oldTokenHash },
            data: { revoked: true, revokedAt: new Date() },
        });

        // Issue new token
        return tx.refreshToken.create({
            data: { userId, tokenHash: newTokenHash, expiresAt },
        });
    });
}

/**
 * Revoke a specific token — used on logout.
 */
export async function revokeRefreshToken(tokenHash: string): Promise<void> {
    await prisma.refreshToken.updateMany({
        where: { tokenHash },
        data: { revoked: true, revokedAt: new Date() },
    });
}

/**
 * Revoke ALL tokens for a user — used on password change / account suspend.
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true, revokedAt: new Date() },
    });
}
