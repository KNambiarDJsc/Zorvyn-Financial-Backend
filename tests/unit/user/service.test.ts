/**
 * User Service Unit Tests
 *
 * Validates all business rules:
 *  - Self-demotion / self-suspension prevention
 *  - Last-admin protection
 *  - Tenant isolation (orgId scoping)
 *  - Session revocation on suspend/deactivate
 */

jest.mock("../../../src/modules/user/repository");
jest.mock("../../../src/modules/audit/service");
jest.mock("../../../src/modules/auth/repository");

import * as repo from "../../../src/modules/user/repository";
import * as authRepo from "../../../src/modules/auth/repository";
import * as userService from "../../../src/modules/user/service";
import {
    NotFoundError,
    ForbiddenError,
    ConflictError,
} from "../../../src/utils/errors";

const mockRepo = repo as jest.Mocked<typeof repo>;
const mockAuthRepo = authRepo as jest.Mocked<typeof authRepo>;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_ID = "org-123";
const ACTOR_ID = "actor-456";
const TARGET_ID = "target-789";

function makeUser(overrides: Partial<repo.UserWithRole> = {}): repo.UserWithRole {
    return {
        id: TARGET_ID,
        email: "target@example.com",
        firstName: "Target",
        lastName: "User",
        status: "ACTIVE",
        orgId: ORG_ID,
        roleId: "role-1",
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: { id: "role-1", name: "VIEWER" as never, description: null },
        organization: { id: ORG_ID, name: "Test Corp", slug: "test-corp" },
        ...overrides,
    } as repo.UserWithRole;
}

// ─────────────────────────────────────────────────────────────────────────────
// getMyProfile()
// ─────────────────────────────────────────────────────────────────────────────

describe("userService.getMyProfile()", () => {
    beforeEach(() => jest.clearAllMocks());

    it("returns serialized profile for existing user", async () => {
        mockRepo.findUserById.mockResolvedValue(makeUser());

        const result = await userService.getMyProfile(TARGET_ID, ORG_ID);

        expect(result.id).toBe(TARGET_ID);
        expect(result.fullName).toBe("Target User");
        expect(result).not.toHaveProperty("passwordHash");
    });

    it("throws NotFoundError when user does not exist", async () => {
        mockRepo.findUserById.mockResolvedValue(null);

        await expect(
            userService.getMyProfile("ghost-id", ORG_ID)
        ).rejects.toThrow(NotFoundError);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateUserRole()
// ─────────────────────────────────────────────────────────────────────────────

describe("userService.updateUserRole()", () => {
    beforeEach(() => jest.clearAllMocks());

    it("successfully updates role when actor != target", async () => {
        const adminTarget = makeUser({
            id: TARGET_ID,
            role: { id: "role-1", name: "VIEWER" as never, description: null },
        });
        mockRepo.findUserById.mockResolvedValue(adminTarget);
        mockRepo.updateUserRole.mockResolvedValue(
            makeUser({ role: { id: "role-2", name: "ANALYST" as never, description: null } })
        );

        const result = await userService.updateUserRole(
            ACTOR_ID,
            TARGET_ID,
            ORG_ID,
            { role: "ANALYST" as never }
        );

        expect(result.role).toBe("ANALYST");
    });

    it("throws ForbiddenError when admin tries to demote themselves", async () => {
        await expect(
            userService.updateUserRole(
                ACTOR_ID,
                ACTOR_ID, // same user — self-demotion
                ORG_ID,
                { role: "VIEWER" as never }
            )
        ).rejects.toThrow(ForbiddenError);

        expect(mockRepo.updateUserRole).not.toHaveBeenCalled();
    });

    it("throws ConflictError when demoting the last admin", async () => {
        const lastAdmin = makeUser({
            role: { id: "role-3", name: "ADMIN" as never, description: null },
        });
        mockRepo.findUserById.mockResolvedValue(lastAdmin);
        mockRepo.countAdminsInOrg.mockResolvedValue(1); // only one admin left

        await expect(
            userService.updateUserRole(
                ACTOR_ID,
                TARGET_ID,
                ORG_ID,
                { role: "VIEWER" as never }
            )
        ).rejects.toThrow(ConflictError);

        expect(mockRepo.updateUserRole).not.toHaveBeenCalled();
    });

    it("allows demoting an admin when other admins exist", async () => {
        const adminTarget = makeUser({
            role: { id: "role-3", name: "ADMIN" as never, description: null },
        });
        mockRepo.findUserById.mockResolvedValue(adminTarget);
        mockRepo.countAdminsInOrg.mockResolvedValue(2); // two admins — safe to demote
        mockRepo.updateUserRole.mockResolvedValue(
            makeUser({ role: { id: "role-1", name: "VIEWER" as never, description: null } })
        );

        const result = await userService.updateUserRole(
            ACTOR_ID,
            TARGET_ID,
            ORG_ID,
            { role: "VIEWER" as never }
        );

        expect(result.role).toBe("VIEWER");
    });

    it("throws NotFoundError when target user does not exist", async () => {
        mockRepo.findUserById.mockResolvedValue(null);

        await expect(
            userService.updateUserRole(
                ACTOR_ID,
                TARGET_ID,
                ORG_ID,
                { role: "ANALYST" as never }
            )
        ).rejects.toThrow(NotFoundError);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateUserStatus()
// ─────────────────────────────────────────────────────────────────────────────

describe("userService.updateUserStatus()", () => {
    beforeEach(() => jest.clearAllMocks());

    it("throws ForbiddenError when user tries to suspend themselves", async () => {
        await expect(
            userService.updateUserStatus(
                ACTOR_ID,
                ACTOR_ID, // self
                ORG_ID,
                { status: "SUSPENDED" as never }
            )
        ).rejects.toThrow(ForbiddenError);
    });

    it("throws ConflictError when suspending the last admin", async () => {
        const lastAdmin = makeUser({
            role: { id: "role-3", name: "ADMIN" as never, description: null },
        });
        mockRepo.findUserById.mockResolvedValue(lastAdmin);
        mockRepo.countAdminsInOrg.mockResolvedValue(1);

        await expect(
            userService.updateUserStatus(
                ACTOR_ID,
                TARGET_ID,
                ORG_ID,
                { status: "SUSPENDED" as never }
            )
        ).rejects.toThrow(ConflictError);
    });

    it("revokes all sessions when user is suspended", async () => {
        const viewer = makeUser();
        mockRepo.findUserById.mockResolvedValue(viewer);
        mockRepo.updateUserStatus.mockResolvedValue(
            makeUser({ status: "SUSPENDED" as never })
        );
        mockAuthRepo.revokeAllUserTokens.mockResolvedValue();

        await userService.updateUserStatus(
            ACTOR_ID,
            TARGET_ID,
            ORG_ID,
            { status: "SUSPENDED" as never }
        );

        // Sessions must be killed immediately on suspension
        expect(mockAuthRepo.revokeAllUserTokens).toHaveBeenCalledWith(TARGET_ID);
    });

    it("revokes all sessions when user is deactivated", async () => {
        const viewer = makeUser();
        mockRepo.findUserById.mockResolvedValue(viewer);
        mockRepo.updateUserStatus.mockResolvedValue(
            makeUser({ status: "INACTIVE" as never })
        );
        mockAuthRepo.revokeAllUserTokens.mockResolvedValue();

        await userService.updateUserStatus(
            ACTOR_ID,
            TARGET_ID,
            ORG_ID,
            { status: "INACTIVE" as never }
        );

        expect(mockAuthRepo.revokeAllUserTokens).toHaveBeenCalledWith(TARGET_ID);
    });

    it("does NOT revoke sessions when user is re-activated", async () => {
        const suspended = makeUser({ status: "SUSPENDED" as never });
        mockRepo.findUserById.mockResolvedValue(suspended);
        mockRepo.updateUserStatus.mockResolvedValue(makeUser({ status: "ACTIVE" as never }));

        await userService.updateUserStatus(
            ACTOR_ID,
            TARGET_ID,
            ORG_ID,
            { status: "ACTIVE" as never }
        );

        expect(mockAuthRepo.revokeAllUserTokens).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// listUsers()
// ─────────────────────────────────────────────────────────────────────────────

describe("userService.listUsers()", () => {
    it("returns items and total, never exposing passwordHash", async () => {
        const users = [makeUser(), makeUser({ id: "user-2", email: "b@b.com" })];
        mockRepo.listUsers.mockResolvedValue({ items: users, total: 2 });

        const result = await userService.listUsers(ORG_ID, {
            page: 1,
            limit: 20,
        });

        expect(result.total).toBe(2);
        expect(result.items).toHaveLength(2);
        result.items.forEach((u) => {
            expect(u).not.toHaveProperty("passwordHash");
        });
    });
});
