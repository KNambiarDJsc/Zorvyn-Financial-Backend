/**
 * Auth Module Types
 */

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
}

export interface AuthResult {
    user: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: string;
        orgId: string;
    };
    tokens: TokenPair;
}

export interface RegisterResult {
    user: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: string;
        orgId: string;
        orgName: string;
    };
    tokens: TokenPair;
}
