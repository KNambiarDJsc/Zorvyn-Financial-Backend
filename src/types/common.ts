/**
 * Shared Domain Types
 */

// Authenticated request context — guaranteed after auth middleware
export interface AuthContext {
    userId: string;
    orgId: string;
    role: string;
}

// Pagination params (offset-based)
export interface PaginationParams {
    page: number;
    limit: number;
    offset: number;
}

// Date range filter
export interface DateRangeFilter {
    startDate?: Date;
    endDate?: Date;
}

// Generic paginated result
export interface PaginatedResult<T> {
    items: T[];
    total: number;
}

// Request metadata passed to audit service
export interface RequestMeta {
    ipAddress?: string;
    userAgent?: string;
}
