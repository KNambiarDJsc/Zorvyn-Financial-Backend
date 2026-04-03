import cluster from "cluster";
import os from "os";
import { env, isDev, isTest } from "./config/env";
import { logger } from "./utils/logger";

const USE_CLUSTER = !isDev && !isTest;



if (cluster.isPrimary && USE_CLUSTER) {
    const numCPUs = os.cpus().length;
    logger.info({ pid: process.pid, workers: numCPUs }, "Primary process started");


    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }


    cluster.on("exit", (worker, code, signal) => {
        logger.error(
            { pid: worker.process.pid, code, signal },
            "Worker died — restarting"
        );
        cluster.fork();
    });

    cluster.on("online", (worker) => {
        logger.info({ pid: worker.process.pid }, "Worker online");
    });
} else {

    startWorker();
}

async function startWorker(): Promise<void> {

    const { buildApp } = await import("./app");
    const { connectDB, disconnectDB } = await import("./config/db");
    const { connectRedis, disconnectRedis } = await import("./config/redis");

    let isShuttingDown = false;

    try {

        await connectDB();
        logger.info("Database connected");

        await connectRedis();
        logger.info("Redis connected");


        const app = await buildApp();


        const { registerRoutes } = await import("./routes");
        await registerRoutes(app);


        await app.listen({ port: env.PORT, host: env.HOST });
        logger.info(
            { port: env.PORT, pid: process.pid },
            "Server listening"
        );


        async function shutdown(signal: string): Promise<void> {
            if (isShuttingDown) return;
            isShuttingDown = true;

            logger.info({ signal }, "Shutdown signal received");

            try {

                await app.close();
                logger.info("Fastify closed");

                await disconnectDB();
                logger.info("Database disconnected");

                await disconnectRedis();
                logger.info("Redis disconnected");

                logger.info("Graceful shutdown complete");
                process.exit(0);
            } catch (err) {
                logger.error({ err }, "Error during shutdown");
                process.exit(1);
            }
        }

        process.on("SIGTERM", () => shutdown("SIGTERM"));
        process.on("SIGINT", () => shutdown("SIGINT"));

        process.on("unhandledRejection", (reason) => {
            logger.error({ reason }, "Unhandled promise rejection");
            shutdown("unhandledRejection");
        });

        process.on("uncaughtException", (err) => {
            logger.fatal({ err }, "Uncaught exception");
            shutdown("uncaughtException");
        });
    } catch (err) {
        logger.fatal({ err }, "Failed to start server");
        process.exit(1);
    }
}