/**
 * Financial Record Controller
 *
 * Thin HTTP layer — parse, delegate, respond.
 * No business logic. All decisions live in the service.
 */

import { FastifyRequest, FastifyReply } from "fastify";
import * as service from "./service";
import {
    validate,
    CreateRecordSchema,
    UpdateRecordSchema,
    RecordIdParamSchema,
    ListRecordsQuerySchema,
} from "./schema";
import { sendSuccess, buildPaginationMeta } from "../../utils/response";
import { UnauthorizedError } from "../../utils/errors";

function requireUser(request: FastifyRequest) {
    if (!request.user) throw new UnauthorizedError();
    return request.user;
}

function requestMeta(request: FastifyRequest) {
    return {
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
    };
}

// ─── POST /records ────────────────────────────────────────────────────────────

export async function createRecordHandler(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const { userId, orgId } = requireUser(request);
    const input = validate(CreateRecordSchema, request.body);
    const record = await service.createRecord(userId, orgId, input, requestMeta(request));
    sendSuccess(reply, record, 201);
}

// ─── GET /records ─────────────────────────────────────────────────────────────

export async function listRecordsHandler(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const { orgId } = requireUser(request);
    const query = validate(ListRecordsQuerySchema, request.query);

    const { items, total } = await service.listRecords(orgId, query);

    sendSuccess(
        reply,
        items,
        200,
        buildPaginationMeta(total, query.page, query.limit)
    );
}

// ─── GET /records/categories ──────────────────────────────────────────────────

export async function getCategoriesHandler(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const { orgId } = requireUser(request);
    const categories = await service.getCategories(orgId);
    sendSuccess(reply, categories);
}

// ─── GET /records/:id ─────────────────────────────────────────────────────────

export async function getRecordByIdHandler(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const { orgId } = requireUser(request);
    const { id } = validate(RecordIdParamSchema, request.params);
    const record = await service.getRecordById(id, orgId);
    sendSuccess(reply, record);
}

// ─── PATCH /records/:id ───────────────────────────────────────────────────────

export async function updateRecordHandler(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const { userId, orgId } = requireUser(request);
    const { id } = validate(RecordIdParamSchema, request.params);
    const input = validate(UpdateRecordSchema, request.body);
    const updated = await service.updateRecord(id, userId, orgId, input, requestMeta(request));
    sendSuccess(reply, updated);
}

// ─── DELETE /records/:id ──────────────────────────────────────────────────────

export async function deleteRecordHandler(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const { userId, orgId } = requireUser(request);
    const { id } = validate(RecordIdParamSchema, request.params);
    await service.deleteRecord(id, userId, orgId, requestMeta(request));
    sendSuccess(reply, { message: "Record deleted successfully" });
}
