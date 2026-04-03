/**
 * User Service
 *
 * Business logic for user and role management.
 * All operations are scoped to the authenticated user's orgId —
 * cross-tenant access is structurally impossible here.
 */

import { RoleName, UserStatus } from "@prisma/client";
import { NotFoundError, ForbiddenError, ConflictError } from "../../utils/errors";
import { AuditAction, AuditEntity } from "../../constants/audit-actions";
import { createAuditLog } from "../audit/service";
import { revokeAllUserTokens } from "../auth/repository";
import type {
    UpdateProfileInput,
    UpdateUserRoleInput,
    UpdateUserStatusInput,
    ListUsersQuery,
} from "./schema";
import type { UserProfile, UserListItem, RoleItem } from "./types";
import type { PaginatedResult, RequestMeta } from "../../types/common";
import * as repo from "./repository";

// ─── Serializers ──────────────────────────────────────────────────────────────
// Map Prisma result → safe public shape (no passwordHash, no internals)

function toUserProfile(u: repo.UserWithRole): UserProfile {
    return {
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        fullName: `${u.firstName} ${u.lastName}`,
        role: u.role.name,
        status: u.status,
        orgId: u.orgId,
        orgName: u.organization.name,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
    };
}

function toUserListItem(u: repo.UserWithRole): UserListItem {
    return {
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        fullName: `${u.firstName} ${u.lastName}`,
        role: u.role.name,
        status: u.status,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
    };
}

// ─── Get current user profile ─────────────────────────────────────────────────

export async function getMyProfile(
    userId: string,
    orgId: string
): Promise<UserProfile> {
    const user = await repo.findUserById(userId, orgId);
    if (!user) throw new NotFoundError("User not found");
    return toUserProfile(user);
}

// ─── Update own profile ───────────────────────────────────────────────────────

export async function updateMyProfile(
    userId: string,
    orgId: string,
    input: UpdateProfileInput,
    meta?: RequestMeta
): Promise<UserProfile> {
    const existing = await repo.findUserById(userId, orgId);
    if (!existing) throw new NotFoundError("User not found");

    const updated = await repo.updateUserProfile(userId, orgId, input);

    await createAuditLog({
        orgId,
        userId,
        action: AuditAction.USER_UPDATE_ROLE, // reuse closest action
        entity: AuditEntity.USER,
        entityId: userId,
        before: { firstName: existing.firstName, lastName: existing.lastName },
        after: { firstName: updated.firstName, lastName: updated.lastName },
        meta,
    });

    return toUserProfile(updated);
}

// ─── List all users in org (Admin only) ───────────────────────────────────────

export async function listUsers(
    orgId: string,
    query: ListUsersQuery
): Promise<PaginatedResult<UserListItem>> {
    const { items, total } = await repo.listUsers(orgId, query);
    return {
        items: items.map(toUserListItem),
        total,
    };
}

// ─── Get a specific user by ID (Admin only) ───────────────────────────────────

export async function getUserById(
    targetUserId: string,
    orgId: string
): Promise<UserProfile> {
    const user = await repo.findUserById(targetUserId, orgId);
    if (!user) throw new NotFoundError("User not found");
    return toUserProfile(user);
}

// ─── Update user role (Admin only) ────────────────────────────────────────────

export async function updateUserRole(
    actorId: string,
    targetUserId: string,
    orgId: string,
    input: UpdateUserRoleInput,
    meta?: RequestMeta
): Promise<UserProfile> {
    // Prevent self-demotion
    if (actorId === targetUserId && input.role !== RoleName.ADMIN) {
        throw new ForbiddenError("You cannot change your own role");
    }

    const target = await repo.findUserById(targetUserId, orgId);
    if (!target) throw new NotFoundError("User not found");

    // Prevent demoting the last admin in the org
    if (
        target.role.name === RoleName.ADMIN &&
        input.role !== RoleName.ADMIN
    ) {
        const adminCount = await repo.countAdminsInOrg(orgId);
        if (adminCount <= 1) {
            throw new ConflictError(
                "Cannot demote the last admin. Promote another user to ADMIN first."
            );
        }
    }

    const updated = await repo.updateUserRole(targetUserId, orgId, input.role);

    await createAuditLog({
        orgId,
        userId: actorId,
        action: AuditAction.USER_UPDATE_ROLE,
        entity: AuditEntity.USER,
        entityId: targetUserId,
        before: { role: target.role.name },
        after: { role: updated.role.name },
        meta,
    });

    return toUserProfile(updated);
}

// ─── Update user status (Admin only) ──────────────────────────────────────────

export async function updateUserStatus(
    actorId: string,
    targetUserId: string,
    orgId: string,
    input: UpdateUserStatusInput,
    meta?: RequestMeta
): Promise<UserProfile> {
    // Prevent self-suspension
    if (actorId === targetUserId && input.status !== UserStatus.ACTIVE) {
        throw new ForbiddenError("You cannot change your own account status");
    }

    const target = await repo.findUserById(targetUserId, orgId);
    if (!target) throw new NotFoundError("User not found");

    // Prevent suspending the last admin
    if (
        target.role.name === RoleName.ADMIN &&
        input.status !== UserStatus.ACTIVE
    ) {
        const adminCount = await repo.countAdminsInOrg(orgId);
        if (adminCount <= 1) {
            throw new ConflictError(
                "Cannot suspend the last admin. Promote another user to ADMIN first."
            );
        }
    }

    const updated = await repo.updateUserStatus(
        targetUserId,
        orgId,
        input.status
    );

    // If suspending or deactivating, revoke all active sessions immediately
    if (input.status !== UserStatus.ACTIVE) {
        await revokeAllUserTokens(targetUserId);
    }

    await createAuditLog({
        orgId,
        userId: actorId,
        action: AuditAction.USER_UPDATE_STATUS,
        entity: AuditEntity.USER,
        entityId: targetUserId,
        before: { status: target.status },
        after: { status: updated.status },
        meta,
    });

    return toUserProfile(updated);
}

// ─── List roles ───────────────────────────────────────────────────────────────

export async function listRoles(): Promise<RoleItem[]> {
    const roles = await repo.listRoles();
    return roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
    }));
}
