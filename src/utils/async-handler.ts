/**
 * Async Handler Wrapper
 *
 * Wraps async route handlers so uncaught promise rejections are
 * forwarded to Fastify's error handler instead of crashing the process.
 *
 * Without this, an unhandled rejection inside a handler would either
 * hang the request or emit an UnhandledPromiseRejectionWarning.
 */

import { FastifyRequest, FastifyReply, RouteHandlerMethod } from "fastify";

type AsyncHandler = (
    request: FastifyRequest,
    reply: FastifyReply
) => Promise<void>;

export function asyncHandler(fn: AsyncHandler): RouteHandlerMethod {
    return function (request: FastifyRequest, reply: FastifyReply) {
        return Promise.resolve(fn(request, reply)).catch((err: unknown) => {
            reply.send(err); // forwards to Fastify's setErrorHandler
        });
    };
}
