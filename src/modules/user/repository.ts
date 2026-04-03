/**
 * User Repository
 *
 * All database access for the user module.
 * No business logic — only DB queries.
 *
 * Critical rule: ALL queries are scoped by orgId.
 * This is the primary multi-tenant isolation enforcement point.
 */

import { Prisma, RoleName, UserStatus } from "@prisma/client";
import { prisma } from "../../config/db";
import type { ListUsersQuery } from "./schema";
import type { PaginatedResult } from "../../types/common";

// ─── Select shape ─────────────────────────────────────────────────────────────
// Explicit select: never accidentally expose passwordHash

const userSelect = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    status: true,
    lastLoginAt: true,
    createdAt: true,
    updatedAt: true,
    orgId: true,
    role: { select: { id: true, name: true, description: true } },
    organization: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.UserSelect;

export type UserWithRole = Prisma.UserGetPayload<{ select: typeof userSelect }>;

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function findUserById(
    userId: string,
    orgId: string
): Promise<UserWithRole | null> {
    return prisma.user.findFirst({
        where: {
            id: userId,
            orgId, // enforce tenant boundary
        },
        select: userSelect,
    });
}

export async function listUsers(
    orgId: string,
    query: ListUsersQuery
): Promise<PaginatedResult<UserWithRole>> {
    const { page, limit, role, status, search } = query;
    const offset = (page - 1) * limit;

    // Build filter — all scoped to orgId
    const where: Prisma.UserWhereInput = {
        orgId,
        ...(role && { role: { name: role } }),
        ...(status && { status }),
        ...(search && {
            OR: [
                { email: { contains: search, mode: "insensitive" } },
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
            ],
        }),
    };

    // Run count + data fetch in parallel — single round-trip cost
    const [total, items] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
            where,
            select: userSelect,
            orderBy: { createdAt: "desc" },
            skip: offset,
            take: limit,
        }),
    ]);

    return { items, total };
}

export async function updateUserProfile(
    userId: string,
    orgId: string,
    data: { firstName?: string; lastName?: string }
): Promise<UserWithRole> {
    return prisma.user.update({
        where: { id: userId, orgId },
        data,
        select: userSelect,
    });
}

export async function updateUserRole(
    userId: string,
    orgId: string,
    roleName: RoleName
): Promise<UserWithRole> {
    // Resolve role ID from name
    const role = await prisma.role.findUniqueOrThrow({
        where: { name: roleName },
    });

    return prisma.user.update({
        where: { id: userId, orgId },
        data: { roleId: role.id },
        select: userSelect,
    });
}

export async function updateUserStatus(
    userId: string,
    orgId: string,
    status: UserStatus
): Promise<UserWithRole> {
    return prisma.user.update({
        where: { id: userId, orgId },
        data: { status },
        select: userSelect,
    });
}

// ─── Roles ────────────────────────────────────────────────────────────────────

export async function listRoles() {
    return prisma.role.findMany({
        select: { id: true, name: true, description: true },
        orderBy: { name: "asc" },
    });
}

// ─── Admin count guard ────────────────────────────────────────────────────────

/**
 * Count active admins in an org.
 * Used to prevent demoting the last admin.
 */
export async function countAdminsInOrg(orgId: string): Promise<number> {
    return prisma.user.count({
        where: {
            orgId,
            status: "ACTIVE",
            role: { name: RoleName.ADMIN },
        },
    });
}
