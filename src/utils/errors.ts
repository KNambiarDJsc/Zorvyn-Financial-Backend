/**
 * Application Error Hierarchy
 *
 * All domain errors extend AppError so the global error handler
 * can distinguish them from unexpected Node errors and respond correctly.
 *
 * Usage:
 *   throw new NotFoundError("Record not found")
 *   throw new ForbiddenError("Insufficient permissions")
 */

export class AppError extends Error {
    public readonly statusCode: number;
    public readonly code: string;
    public readonly isOperational: boolean;
    public readonly details?: unknown;

    constructor(
        message: string,
        statusCode: number,
        code: string,
        details?: unknown
    ) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true; // expected, user-facing errors
        this.details = details;

        // Maintains proper prototype chain in transpiled TypeScript
        Object.setPrototypeOf(this, new.target.prototype);
        Error.captureStackTrace(this, this.constructor);
    }
}

// ─── HTTP Error Subclasses ────────────────────────────────────────────────────

export class ValidationError extends AppError {
    constructor(message: string, details?: unknown) {
        super(message, 400, "VALIDATION_ERROR", details);
    }
}

export class UnauthorizedError extends AppError {
    constructor(message = "Unauthorized") {
        super(message, 401, "UNAUTHORIZED");
    }
}

export class ForbiddenError extends AppError {
    constructor(message = "You do not have permission to perform this action") {
        super(message, 403, "FORBIDDEN");
    }
}

export class NotFoundError extends AppError {
    constructor(message = "Resource not found") {
        super(message, 404, "NOT_FOUND");
    }
}

export class ConflictError extends AppError {
    constructor(message: string, details?: unknown) {
        super(message, 409, "CONFLICT", details);
    }
}

export class UnprocessableError extends AppError {
    constructor(message: string, details?: unknown) {
        super(message, 422, "UNPROCESSABLE", details);
    }
}

export class TooManyRequestsError extends AppError {
    constructor(message = "Too many requests — please try again later") {
        super(message, 429, "RATE_LIMITED");
    }
}

export class InternalError extends AppError {
    constructor(message = "An unexpected error occurred") {
        super(message, 500, "INTERNAL_ERROR");
    }
}

// ─── Type Guard ───────────────────────────────────────────────────────────────

export function isAppError(err: unknown): err is AppError {
    return err instanceof AppError;
}
