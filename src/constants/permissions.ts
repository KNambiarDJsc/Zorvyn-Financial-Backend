

import { RoleName } from "@prisma/client";



export const PERMISSIONS = {
    // Financial Records
    RECORDS_READ: "records:read",
    RECORDS_CREATE: "records:create",
    RECORDS_UPDATE: "records:update",
    RECORDS_DELETE: "records:delete",

    // Dashboard / Analytics
    DASHBOARD_READ: "dashboard:read",
    ANALYTICS_READ: "analytics:read",

    // Users
    USERS_READ_SELF: "users:read_self",
    USERS_READ_ALL: "users:read_all",
    USERS_MANAGE: "users:manage",         // change role, status
    USERS_CREATE: "users:create",

    // Audit Logs
    AUDIT_READ: "audit:read",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];



export const ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
    [RoleName.VIEWER]: [
        PERMISSIONS.RECORDS_READ,
        PERMISSIONS.DASHBOARD_READ,
        PERMISSIONS.USERS_READ_SELF,
    ],

    [RoleName.ANALYST]: [
        PERMISSIONS.RECORDS_READ,
        PERMISSIONS.RECORDS_UPDATE,      // analysts can annotate/update records
        PERMISSIONS.DASHBOARD_READ,
        PERMISSIONS.ANALYTICS_READ,
        PERMISSIONS.USERS_READ_SELF,
    ],

    [RoleName.ADMIN]: [
        PERMISSIONS.RECORDS_READ,
        PERMISSIONS.RECORDS_CREATE,
        PERMISSIONS.RECORDS_UPDATE,
        PERMISSIONS.RECORDS_DELETE,
        PERMISSIONS.DASHBOARD_READ,
        PERMISSIONS.ANALYTICS_READ,
        PERMISSIONS.USERS_READ_SELF,
        PERMISSIONS.USERS_READ_ALL,
        PERMISSIONS.USERS_MANAGE,
        PERMISSIONS.USERS_CREATE,
        PERMISSIONS.AUDIT_READ,
    ],
};

// ─── Helper ───────────────────────────────────────────────────────────────────

export function hasPermission(role: RoleName, permission: Permission): boolean {
    return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function hasAnyPermission(
    role: RoleName,
    permissions: Permission[]
): boolean {
    return permissions.some((p) => hasPermission(role, p));
}
