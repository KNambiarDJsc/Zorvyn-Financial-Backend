import { FastifyInstance } from "fastify";

export async function registerRoutes(app: FastifyInstance): Promise<void> {

    const { authRoutes } = await import("./modules/auth/routes");
    await app.register(authRoutes, { prefix: "/api/v1/auth" });


    const { userRoutes } = await import("./modules/user/routes");
    await app.register(userRoutes, { prefix: "/api/v1/users" });


    const { recordRoutes } = await import("./modules/financial-record/routes");
    await app.register(recordRoutes, { prefix: "/api/v1/records" });

    const { dashboardRoutes } = await import("./modules/dashboard/routes");
    await app.register(dashboardRoutes, { prefix: "/api/v1/dashboard" });
}
