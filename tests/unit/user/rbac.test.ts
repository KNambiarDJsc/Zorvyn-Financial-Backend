import { hasPermission, hasAnyPermission, PERMISSIONS, ROLE_PERMISSIONS } from "../../../src/constants/permissions";
import { RoleName } from "@prisma/client";

describe("Permission Matrix — VIEWER", () => {
    const role = RoleName.VIEWER;

    it("can read records", () => {
        expect(hasPermission(role, PERMISSIONS.RECORDS_READ)).toBe(true);
    });

    it("can view dashboard", () => {
        expect(hasPermission(role, PERMISSIONS.DASHBOARD_READ)).toBe(true);
    });

    it("CANNOT create records", () => {
        expect(hasPermission(role, PERMISSIONS.RECORDS_CREATE)).toBe(false);
    });

    it("CANNOT update records", () => {
        expect(hasPermission(role, PERMISSIONS.RECORDS_UPDATE)).toBe(false);
    });

    it("CANNOT delete records", () => {
        expect(hasPermission(role, PERMISSIONS.RECORDS_DELETE)).toBe(false);
    });

    it("CANNOT manage users", () => {
        expect(hasPermission(role, PERMISSIONS.USERS_MANAGE)).toBe(false);
    });

    it("CANNOT read analytics", () => {
        expect(hasPermission(role, PERMISSIONS.ANALYTICS_READ)).toBe(false);
    });

    it("CANNOT read all users", () => {
        expect(hasPermission(role, PERMISSIONS.USERS_READ_ALL)).toBe(false);
    });
});

describe("Permission Matrix — ANALYST", () => {
    const role = RoleName.ANALYST;

    it("can read records", () => {
        expect(hasPermission(role, PERMISSIONS.RECORDS_READ)).toBe(true);
    });

    it("can update records", () => {
        expect(hasPermission(role, PERMISSIONS.RECORDS_UPDATE)).toBe(true);
    });

    it("can access analytics", () => {
        expect(hasPermission(role, PERMISSIONS.ANALYTICS_READ)).toBe(true);
    });

    it("CANNOT create records", () => {
        expect(hasPermission(role, PERMISSIONS.RECORDS_CREATE)).toBe(false);
    });

    it("CANNOT delete records", () => {
        expect(hasPermission(role, PERMISSIONS.RECORDS_DELETE)).toBe(false);
    });

    it("CANNOT manage users", () => {
        expect(hasPermission(role, PERMISSIONS.USERS_MANAGE)).toBe(false);
    });

    it("CANNOT read all users", () => {
        expect(hasPermission(role, PERMISSIONS.USERS_READ_ALL)).toBe(false);
    });
});

describe("Permission Matrix — ADMIN", () => {
    const role = RoleName.ADMIN;

    it("has all record permissions", () => {
        expect(hasPermission(role, PERMISSIONS.RECORDS_READ)).toBe(true);
        expect(hasPermission(role, PERMISSIONS.RECORDS_CREATE)).toBe(true);
        expect(hasPermission(role, PERMISSIONS.RECORDS_UPDATE)).toBe(true);
        expect(hasPermission(role, PERMISSIONS.RECORDS_DELETE)).toBe(true);
    });

    it("has all user management permissions", () => {
        expect(hasPermission(role, PERMISSIONS.USERS_READ_ALL)).toBe(true);
        expect(hasPermission(role, PERMISSIONS.USERS_MANAGE)).toBe(true);
        expect(hasPermission(role, PERMISSIONS.USERS_CREATE)).toBe(true);
    });

    it("can read audit logs", () => {
        expect(hasPermission(role, PERMISSIONS.AUDIT_READ)).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Privilege Escalation Guards
// ─────────────────────────────────────────────────────────────────────────────

describe("Privilege escalation guards", () => {
    it("VIEWER cannot access any ADMIN-only permission", () => {
        const adminOnlyPermissions = [
            PERMISSIONS.RECORDS_CREATE,
            PERMISSIONS.RECORDS_DELETE,
            PERMISSIONS.USERS_READ_ALL,
            PERMISSIONS.USERS_MANAGE,
            PERMISSIONS.AUDIT_READ,
        ];

        adminOnlyPermissions.forEach((p) => {
            expect(hasPermission(RoleName.VIEWER, p)).toBe(false);
        });
    });

    it("ANALYST cannot access admin-only permissions", () => {
        expect(hasPermission(RoleName.ANALYST, PERMISSIONS.RECORDS_CREATE)).toBe(false);
        expect(hasPermission(RoleName.ANALYST, PERMISSIONS.RECORDS_DELETE)).toBe(false);
        expect(hasPermission(RoleName.ANALYST, PERMISSIONS.USERS_MANAGE)).toBe(false);
        expect(hasPermission(RoleName.ANALYST, PERMISSIONS.AUDIT_READ)).toBe(false);
    });

    it("every role has at least USERS_READ_SELF", () => {
        Object.values(RoleName).forEach((role) => {
            expect(hasPermission(role, PERMISSIONS.USERS_READ_SELF)).toBe(true);
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// hasAnyPermission helper
// ─────────────────────────────────────────────────────────────────────────────

describe("hasAnyPermission()", () => {
    it("returns true if role has at least one of the listed permissions", () => {
        // ANALYST has RECORDS_UPDATE but not RECORDS_CREATE
        expect(
            hasAnyPermission(RoleName.ANALYST, [
                PERMISSIONS.RECORDS_CREATE,
                PERMISSIONS.RECORDS_UPDATE,
            ])
        ).toBe(true);
    });

    it("returns false if role has none of the listed permissions", () => {
        expect(
            hasAnyPermission(RoleName.VIEWER, [
                PERMISSIONS.RECORDS_CREATE,
                PERMISSIONS.RECORDS_DELETE,
                PERMISSIONS.USERS_MANAGE,
            ])
        ).toBe(false);
    });

    it("returns false for empty permissions array", () => {
        expect(hasAnyPermission(RoleName.ADMIN, [])).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Role permission completeness check
// ─────────────────────────────────────────────────────────────────────────────

describe("Role permission coverage", () => {
    it("every RoleName has an entry in ROLE_PERMISSIONS", () => {
        Object.values(RoleName).forEach((role) => {
            expect(ROLE_PERMISSIONS).toHaveProperty(role);
            expect(Array.isArray(ROLE_PERMISSIONS[role])).toBe(true);
        });
    });

    it("ADMIN has strictly more permissions than ANALYST", () => {
        const analystPerms = new Set(ROLE_PERMISSIONS[RoleName.ANALYST]);
        const adminPerms = new Set(ROLE_PERMISSIONS[RoleName.ADMIN]);

        // Every analyst permission is also in admin
        analystPerms.forEach((p) => {
            expect(adminPerms.has(p)).toBe(true);
        });

        // Admin has additional permissions analyst doesn't
        expect(adminPerms.size).toBeGreaterThan(analystPerms.size);
    });

    it("ANALYST has strictly more permissions than VIEWER", () => {
        const viewerPerms = new Set(ROLE_PERMISSIONS[RoleName.VIEWER]);
        const analystPerms = new Set(ROLE_PERMISSIONS[RoleName.ANALYST]);

        viewerPerms.forEach((p) => {
            expect(analystPerms.has(p)).toBe(true);
        });

        expect(analystPerms.size).toBeGreaterThan(viewerPerms.size);
    });
});
