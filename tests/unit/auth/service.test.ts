/**
 * Auth Service Unit Tests
 *
 * All external dependencies (DB, bcrypt, JWT) are mocked.
 * Tests validate business logic in isolation — fast, deterministic.
 */

import { ConflictError, UnauthorizedError, ForbiddenError } from "../../../src/utils/errors";

// ── Mock all external dependencies ────────────────────────────────────────────

jest.mock("../../../src/modules/auth/repository");
jest.mock("../../../src/modules/audit/service");
jest.mock("bcrypt");
jest.mock("../../../src/utils/jwt");

import * as repo from "../../../src/modules/auth/repository";
import bcrypt from "bcrypt";
import * as jwtUtils from "../../../src/utils/jwt";
import * as authService from "../../../src/modules/auth/service";

const mockRepo = repo as jest.Mocked<typeof repo>;
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;
const mockJwt = jwtUtils as jest.Mocked<typeof jwtUtils>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockUser = {
    id: "user-123",
    email: "alice@example.com",
    passwordHash: "$2b$12$hashedpassword",
    firstName: "Alice",
    lastName: "Smith",
    orgId: "org-123",
    roleId: "role-123",
    status: "ACTIVE" as const,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    role: { name: "ADMIN" },
};

const mockOrg = {
    id: "org-123",
    name: "Test Corp",
    slug: "test-corp",
    status: "ACTIVE" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
};

// ─────────────────────────────────────────────────────────────────────────────
// register()
// ─────────────────────────────────────────────────────────────────────────────

describe("authService.register()", () => {
    beforeEach(() => jest.clearAllMocks());

    it("creates a new org + admin user when orgName is provided", async () => {
        mockRepo.findUserByEmail.mockResolvedValue(null);
        (mockBcrypt.hash as jest.Mock).mockResolvedValue("$2b$12$hashed");
        mockRepo.createUserWithOrg.mockResolvedValue({
            ...mockUser,
            organization: { name: "Test Corp" },
        } as never);
        mockJwt.signAccessToken.mockReturnValue("access-token");
        mockJwt.signRefreshToken.mockReturnValue("refresh-token");
        mockJwt.hashToken.mockReturnValue("hashed-refresh");
        mockJwt.refreshTokenExpiresAt.mockReturnValue(new Date());
        mockRepo.createRefreshToken.mockResolvedValue({} as never);

        const result = await authService.register({
            email: "alice@example.com",
            password: "Secure123!",
            firstName: "Alice",
            lastName: "Smith",
            orgName: "Test Corp",
        });

        expect(result.user.email).toBe("alice@example.com");
        expect(result.user.role).toBe("ADMIN");
        expect(result.tokens.accessToken).toBe("access-token");
        expect(mockRepo.createUserWithOrg).toHaveBeenCalledTimes(1);
    });

    it("throws ConflictError when email is already taken", async () => {
        mockRepo.findUserByEmail.mockResolvedValue(mockUser as never);

        await expect(
            authService.register({
                email: "alice@example.com",
                password: "Secure123!",
                firstName: "Alice",
                lastName: "Smith",
                orgName: "Test Corp",
            })
        ).rejects.toThrow(ConflictError);

        expect(mockRepo.createUserWithOrg).not.toHaveBeenCalled();
    });

    it("throws ConflictError when neither orgName nor orgId is provided", async () => {
        mockRepo.findUserByEmail.mockResolvedValue(null);
        (mockBcrypt.hash as jest.Mock).mockResolvedValue("$2b$12$hashed");

        await expect(
            authService.register({
                email: "alice@example.com",
                password: "Secure123!",
                firstName: "Alice",
                lastName: "Smith",
            })
        ).rejects.toThrow(ConflictError);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// login()
// ─────────────────────────────────────────────────────────────────────────────

describe("authService.login()", () => {
    beforeEach(() => jest.clearAllMocks());

    it("returns user + tokens on valid credentials", async () => {
        mockRepo.findUserByEmail.mockResolvedValue(mockUser as never);
        (mockBcrypt.compare as jest.Mock).mockResolvedValue(true);
        mockJwt.signAccessToken.mockReturnValue("access-token");
        mockJwt.signRefreshToken.mockReturnValue("refresh-token");
        mockJwt.hashToken.mockReturnValue("hashed");
        mockJwt.refreshTokenExpiresAt.mockReturnValue(new Date());
        mockRepo.createRefreshToken.mockResolvedValue({} as never);
        mockRepo.updateUserLastLogin.mockResolvedValue();

        const result = await authService.login({
            email: "alice@example.com",
            password: "Secure123!",
        });

        expect(result.user.id).toBe("user-123");
        expect(result.tokens.accessToken).toBe("access-token");
    });

    it("throws UnauthorizedError on unknown email", async () => {
        mockRepo.findUserByEmail.mockResolvedValue(null);

        await expect(
            authService.login({ email: "ghost@example.com", password: "anything" })
        ).rejects.toThrow(UnauthorizedError);
    });

    it("throws UnauthorizedError on wrong password", async () => {
        mockRepo.findUserByEmail.mockResolvedValue(mockUser as never);
        (mockBcrypt.compare as jest.Mock).mockResolvedValue(false);

        await expect(
            authService.login({ email: "alice@example.com", password: "WrongPass1!" })
        ).rejects.toThrow(UnauthorizedError);
    });

    it("throws ForbiddenError for suspended accounts", async () => {
        mockRepo.findUserByEmail.mockResolvedValue({
            ...mockUser,
            status: "SUSPENDED",
        } as never);

        await expect(
            authService.login({ email: "alice@example.com", password: "Secure123!" })
        ).rejects.toThrow(ForbiddenError);

        // Password should not be checked for suspended accounts
        expect(mockBcrypt.compare).not.toHaveBeenCalled();
    });

    it("throws ForbiddenError for inactive accounts", async () => {
        mockRepo.findUserByEmail.mockResolvedValue({
            ...mockUser,
            status: "INACTIVE",
        } as never);

        await expect(
            authService.login({ email: "alice@example.com", password: "Secure123!" })
        ).rejects.toThrow(ForbiddenError);
    });

    it("uses a generic error message for both user-not-found and wrong-password (prevents enumeration)", async () => {
        mockRepo.findUserByEmail.mockResolvedValue(null);
        const notFoundError = await authService
            .login({ email: "ghost@example.com", password: "anything" })
            .catch((e: UnauthorizedError) => e);

        mockRepo.findUserByEmail.mockResolvedValue(mockUser as never);
        (mockBcrypt.compare as jest.Mock).mockResolvedValue(false);
        const wrongPassError = await authService
            .login({ email: "alice@example.com", password: "wrong" })
            .catch((e: UnauthorizedError) => e);

        // Both errors must have identical messages
        expect((notFoundError as UnauthorizedError).message).toBe(
            (wrongPassError as UnauthorizedError).message
        );
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// refresh()
// ─────────────────────────────────────────────────────────────────────────────

describe("authService.refresh()", () => {
    beforeEach(() => jest.clearAllMocks());

    it("returns new token pair and rotates the refresh token", async () => {
        mockJwt.verifyRefreshToken.mockReturnValue({
            userId: "user-123",
            orgId: "org-123",
            role: "ADMIN",
            type: "refresh",
            iat: 0,
            exp: 9999999999,
            iss: "zorvyn-api",
        });
        mockJwt.hashToken.mockReturnValue("hashed-token");
        mockRepo.findRefreshToken.mockResolvedValue({ id: "token-1" } as never);
        mockRepo.findUserById.mockResolvedValue({ ...mockUser, status: "ACTIVE" } as never);
        mockJwt.signRefreshToken.mockReturnValue("new-refresh-token");
        mockJwt.signAccessToken.mockReturnValue("new-access-token");
        mockJwt.refreshTokenExpiresAt.mockReturnValue(new Date());
        mockRepo.rotateRefreshToken.mockResolvedValue({} as never);

        const result = await authService.refresh({
            refreshToken: "valid-refresh-token",
        });

        expect(result.accessToken).toBe("new-access-token");
        expect(result.refreshToken).toBe("new-refresh-token");
        expect(mockRepo.rotateRefreshToken).toHaveBeenCalledTimes(1);
    });

    it("throws UnauthorizedError and revokes all tokens on replay attack", async () => {
        mockJwt.verifyRefreshToken.mockReturnValue({
            userId: "user-123",
            orgId: "org-123",
            role: "ADMIN",
            type: "refresh",
            iat: 0,
            exp: 9999999999,
            iss: "zorvyn-api",
        });
        mockJwt.hashToken.mockReturnValue("hashed-token");
        // Token not found in DB — already used or revoked
        mockRepo.findRefreshToken.mockResolvedValue(null);
        mockRepo.revokeAllUserTokens.mockResolvedValue();

        await expect(
            authService.refresh({ refreshToken: "replayed-token" })
        ).rejects.toThrow(UnauthorizedError);

        // Security: revoke ALL tokens on suspected replay
        expect(mockRepo.revokeAllUserTokens).toHaveBeenCalledWith("user-123");
    });

    it("throws UnauthorizedError for invalid JWT", async () => {
        mockJwt.verifyRefreshToken.mockImplementation(() => {
            throw new Error("jwt expired");
        });

        await expect(
            authService.refresh({ refreshToken: "bad-token" })
        ).rejects.toThrow(UnauthorizedError);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// logout()
// ─────────────────────────────────────────────────────────────────────────────

describe("authService.logout()", () => {
    it("revokes the provided refresh token", async () => {
        mockJwt.hashToken.mockReturnValue("hashed");
        mockRepo.revokeRefreshToken.mockResolvedValue();

        await authService.logout({ refreshToken: "some-token" });

        expect(mockRepo.revokeRefreshToken).toHaveBeenCalledWith("hashed");
    });

    it("does not throw even if token is already revoked or not found", async () => {
        mockJwt.hashToken.mockReturnValue("hashed");
        mockRepo.revokeRefreshToken.mockResolvedValue(); // no-op fine

        await expect(
            authService.logout({ refreshToken: "expired-token" })
        ).resolves.not.toThrow();
    });
});
