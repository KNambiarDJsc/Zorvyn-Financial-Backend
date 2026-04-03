

import { FastifyReply } from "fastify";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PaginationMeta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    nextCursor?: string | null;
}

export interface ApiSuccess<T> {
    success: true;
    data: T;
    meta?: PaginationMeta;
}

export interface ApiError {
    success: false;
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Builders ─────────────────────────────────────────────────────────────────

export function successResponse<T>(
    data: T,
    meta?: PaginationMeta
): ApiSuccess<T> {
    return {
        success: true,
        data,
        ...(meta && { meta }),
    };
}

export function errorResponse(
    code: string,
    message: string,
    details?: unknown
): ApiError {
    return {
        success: false,
        error: { code, message, ...(details !== undefined && { details }) },
    };
}

// ─── Reply Helpers ────────────────────────────────────────────────────────────

export function sendSuccess<T>(
    reply: FastifyReply,
    data: T,
    statusCode = 200,
    meta?: PaginationMeta
): FastifyReply {
    return reply.status(statusCode).send(successResponse(data, meta));
}

export function sendError(
    reply: FastifyReply,
    statusCode: number,
    code: string,
    message: string,
    details?: unknown
): FastifyReply {
    return reply.status(statusCode).send(errorResponse(code, message, details));
}

// ─── Pagination Helper ────────────────────────────────────────────────────────

export function buildPaginationMeta(
    total: number,
    page: number,
    limit: number
): PaginationMeta {
    const totalPages = Math.ceil(total / limit);
    return {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
    };
}
