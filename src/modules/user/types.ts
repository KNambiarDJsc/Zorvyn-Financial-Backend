/**
 * User Module Types
 *
 * Response shapes returned by the service layer.
 * Controllers serialize these — never expose raw Prisma models
 * (they contain passwordHash and other internal fields).
 */

export interface UserProfile {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    fullName: string;
    role: string;
    status: string;
    orgId: string;
    orgName: string;
    lastLoginAt: string | null;
    createdAt: string;
}

export interface UserListItem {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    fullName: string;
    role: string;
    status: string;
    lastLoginAt: string | null;
    createdAt: string;
}

export interface RoleItem {
    id: string;
    name: string;
    description: string | null;
}
