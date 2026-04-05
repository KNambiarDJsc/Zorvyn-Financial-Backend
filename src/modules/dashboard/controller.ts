/**
 * Dashboard Controller
 *
 * Thin layer — parse query params, call service, send response.
 * All business logic and caching lives in the service.
 */

import { FastifyRequest, FastifyReply } from "fastify";
import * as service from "./service";
import {
  validate,
  SummaryQuerySchema,
  CategoryQuerySchema,
  TrendsQuerySchema,
  RecentQuerySchema,
} from "./schema";
import { sendSuccess } from "../../utils/response";
import { UnauthorizedError } from "../../utils/errors";

function requireUser(request: FastifyRequest) {
  if (!request.user) throw new UnauthorizedError();
  return request.user;
}

// ─── GET /dashboard/summary ───────────────────────────────────────────────────

export async function summaryHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { orgId } = requireUser(request);
  const query = validate(SummaryQuerySchema, request.query);
  const data = await service.getSummary(orgId, query);
  sendSuccess(reply, data);
}

// ─── GET /dashboard/categories ────────────────────────────────────────────────

export async function categoriesHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { orgId } = requireUser(request);
  const query = validate(CategoryQuerySchema, request.query);
  const data = await service.getCategoryBreakdown(orgId, query);
  sendSuccess(reply, data);
}

// ─── GET /dashboard/trends ────────────────────────────────────────────────────

export async function trendsHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { orgId } = requireUser(request);
  const query = validate(TrendsQuerySchema, request.query);
  const data = await service.getTrends(orgId, query);
  sendSuccess(reply, data);
}

// ─── GET /dashboard/recent ────────────────────────────────────────────────────

export async function recentHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { orgId } = requireUser(request);
  const query = validate(RecentQuerySchema, request.query);
  const data = await service.getRecentActivity(orgId, query);
  sendSuccess(reply, data);
}
