/**
 * Prisma Client Singleton
 *
 * Single instance pattern prevents connection exhaustion during
 * hot-reloads in development (ts-node-dev).
 *
 * In production each process gets exactly one client.
 * Connection pooling is handled by PgBouncer or Prisma's built-in pool.
 */

import { PrismaClient } from "@prisma/client";
import { env, isDev } from "./env";

declare global {
    // eslint-disable-next-line no-var
    var __prisma: PrismaClient | undefined;
}

function buildClient(): PrismaClient {
    return new PrismaClient({
        log: isDev
            ? [
                { level: "query", emit: "event" },
                { level: "error", emit: "stdout" },
                { level: "warn", emit: "stdout" },
            ]
            : [{ level: "error", emit: "stdout" }],
        errorFormat: "minimal",
    });
}

export const prisma: PrismaClient = global.__prisma ?? buildClient();

if (isDev) {
    // Attach query logger in dev for visibility
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma as any).$on("query", (e: { query: string; duration: number }) => {
        if (env.NODE_ENV === "development") {
            console.debug(`  🔍 [${e.duration}ms] ${e.query}`);
        }
    });

    global.__prisma = prisma;
}

export async function connectDB(): Promise<void> {
    await prisma.$connect();
}

export async function disconnectDB(): Promise<void> {
    await prisma.$disconnect();
}

/**
 * Verify DB is reachable — used by /ready health check
 */
export async function pingDB(): Promise<boolean> {
    try {
        await prisma.$queryRaw`SELECT 1`;
        return true;
    } catch {
        return false;
    }
}
