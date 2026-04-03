import Redis from "ioredis";
import { env } from "./env";
import { logger } from "../utils/logger";

let client: Redis | null = null;

export function getRedis(): Redis {
    if (client) return client;

    client = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,

        retryStrategy: (times) => Math.min(times * 200, 5000),
    });

    client.on("connect", () => logger.info("Redis connected"));
    client.on("ready", () => logger.info("Redis ready"));
    client.on("error", (err) => logger.error({ err }, "Redis error"));
    client.on("close", () => logger.warn("Redis connection closed"));
    client.on("reconnecting", () => logger.info("Redis reconnecting..."));

    return client;
}

export async function connectRedis(): Promise<void> {
    await getRedis().connect();
}

export async function disconnectRedis(): Promise<void> {
    if (client) {
        await client.quit();
        client = null;
        logger.info("Redis disconnected");
    }
}

export async function pingRedis(): Promise<boolean> {
    try {
        const pong = await getRedis().ping();
        return pong === "PONG";
    } catch {
        return false;
    }
}



export const cache = {
    async get<T>(key: string): Promise<T | null> {
        try {
            const raw = await getRedis().get(key);
            if (!raw) return null;
            return JSON.parse(raw) as T;
        } catch {
            logger.warn({ key }, "Cache get failed — treating as miss");
            return null;
        }
    },


    async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
        try {
            await getRedis().setex(key, ttlSeconds, JSON.stringify(value));
        } catch (err) {
            // Cache failures are non-fatal — log and continue
            logger.warn({ err, key }, "Cache set failed");
        }
    },

    /**
     * Delete a single key.
     */
    async del(key: string): Promise<void> {
        try {
            await getRedis().del(key);
        } catch (err) {
            logger.warn({ err, key }, "Cache del failed");
        }
    },

    async delPattern(pattern: string): Promise<void> {
        try {
            const keys = await getRedis().keys(pattern);
            if (keys.length > 0) {
                await getRedis().del(...keys);
                logger.debug({ pattern, count: keys.length }, "Cache keys invalidated");
            }
        } catch (err) {
            logger.warn({ err, pattern }, "Cache delPattern failed");
        }
    },
};


export const CacheKeys = {
    dashboardSummary: (orgId: string) => `dashboard:summary:${orgId}`,
    dashboardCategories: (orgId: string) => `dashboard:categories:${orgId}`,
    dashboardTrends: (orgId: string) => `dashboard:trends:${orgId}`,
    dashboardRecent: (orgId: string) => `dashboard:recent:${orgId}`,
    dashboardAll: (orgId: string) => `dashboard:*:${orgId}`,
} as const;
