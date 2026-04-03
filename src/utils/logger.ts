/**
 * Pino Logger
 *
 * Structured JSON logging for production, pretty-printed for development.
 * Sensitive fields are automatically redacted so they never appear in logs.
 */

import pino from "pino";
import { env } from "../config/env";

export const logger = pino({
    level: env.NODE_ENV === "test" ? "silent" : "info",

    // Pretty print in dev — JSON in production (ingested by log aggregators)
    ...(env.NODE_ENV === "development" && {
        transport: {
            target: "pino-pretty",
            options: {
                colorize: true,
                translateTime: "SYS:HH:MM:ss",
                ignore: "pid,hostname",
                messageFormat: "{msg}",
            },
        },
    }),

    // Base fields on every log line
    base: { env: env.NODE_ENV },

    // Redact sensitive paths from all log objects
    redact: {
        paths: [
            "*.password",
            "*.passwordHash",
            "*.token",
            "*.tokenHash",
            "*.secret",
            "*.authorization",
            "*.cookie",
            "req.headers.authorization",
            "req.headers.cookie",
        ],
        censor: "[REDACTED]",
    },

    // ISO timestamp
    timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;
