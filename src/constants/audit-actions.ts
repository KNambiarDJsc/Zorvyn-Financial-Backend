export const AuditAction = {
    // Auth
    LOGIN: "AUTH_LOGIN",
    LOGOUT: "AUTH_LOGOUT",
    TOKEN_REFRESH: "AUTH_TOKEN_REFRESH",
    REGISTER: "AUTH_REGISTER",

    // Financial Records
    RECORD_CREATE: "RECORD_CREATE",
    RECORD_UPDATE: "RECORD_UPDATE",
    RECORD_DELETE: "RECORD_DELETE",

    // Users
    USER_CREATE: "USER_CREATE",
    USER_UPDATE_ROLE: "USER_UPDATE_ROLE",
    USER_UPDATE_STATUS: "USER_UPDATE_STATUS",
    USER_UPDATE_PROFILE: "USER_UPDATE_PROFILE",
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];

export const AuditEntity = {
    FINANCIAL_RECORD: "financial_record",
    USER: "user",
    AUTH: "auth",
} as const;

export type AuditEntityType = (typeof AuditEntity)[keyof typeof AuditEntity];
