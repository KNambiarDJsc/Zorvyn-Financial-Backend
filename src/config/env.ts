import { z } from "zod";

const envSchema = z.object({

    NODE_ENV: z
        .enum(["development", "production", "test"])
        .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(8000),
    HOST: z.string().default("0.0.0.0"),


    DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),


    REDIS_URL: z.string().default("redis://localhost:6379"),


    JWT_SECRET: z
        .string()
        .min(32, "JWT_SECRET must be at least 32 characters for security"),
    JWT_ACCESS_EXPIRY: z.string().default("15m"),
    JWT_REFRESH_EXPIRY: z.string().default("7d"),


    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
    CORS_ORIGINS: z.string().default("http://localhost:3000"),


    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),


    CACHE_TTL_DASHBOARD: z.coerce.number().int().min(1).default(30),
    CACHE_TTL_SUMMARY: z.coerce.number().int().min(1).default(60),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        const formatted = result.error.issues
            .map((e) => `  • ${e.path.join(".")}: ${e.message}`)
            .join("\n");

        console.error(`\n❌ Invalid environment variables:\n${formatted}\n`);
        console.error("👉 Copy .env.example to .env and fill in the values.\n");
        process.exit(1);
    }

    return result.data;
}


export const env: Env = parseEnv();

export const isDev = env.NODE_ENV === "development";
export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

export const corsOrigins = env.CORS_ORIGINS.split(",").map((o) => o.trim());