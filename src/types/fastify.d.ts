
import { RoleName } from "@prisma/client";
import "fastify";

declare module "fastify" {
    interface FastifyRequest {
        user?: {
            userId: string;
            orgId: string;
            role: RoleName;
        };
    }
}
