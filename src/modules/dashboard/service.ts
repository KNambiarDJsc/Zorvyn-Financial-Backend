/**
 * Dashboard Service
 *
 * Cache-first pattern for all endpoints:
 *  1. Check Redis — return immediately on hit
 *  2. Miss → run DB aggregation → store in Redis → return
 *
 * Cache is invalidated by the financial-record service on every
 * record mutation (create / update / delete), so data is never
 * stale by more than the TTL after a write.
 *
 * Percentage calculation happens here (service layer), not in SQL —
 * it requires the total, which is already available in memory after
 * the aggregation query returns.
 */

import Decimal from "decimal.js";
import { env } from "../../config/env";
import { cache, CacheKeys } from "../../config/redis";
import * as repo from "./repository";
import type {
    DashboardSummary,
    CategoryBreakdown,
    TrendsResult,
    RecentActivity,
} from "./types";
import type { SummaryQuery, CategoryQuery, TrendsQuery, RecentQuery } from "./schema";

// ─── Summary ──────────────────────────────────────────────────────────────────

export async function getSummary(
    orgId: string,
    query: SummaryQuery
): Promise<DashboardSummary> {
    // Build cache key that includes date params so different ranges are cached separately
    const cacheKey = buildKey(CacheKeys.dashboardSummary(orgId), query);

    const cached = await cache.get<DashboardSummary>(cacheKey);
    if (cached) return cached;

    const raw = await repo.fetchSummary(orgId, query);

    const result: DashboardSummary = {
        totalIncome: raw.total_income.toString(),
        totalExpenses: raw.total_expenses.toString(),
        netBalance: raw.net_balance.toString(),
        recordCount: Number(raw.record_count),
        incomeCount: Number(raw.income_count),
        expenseCount: Number(raw.expense_count),
        period: {
            startDate: query.startDate?.toISOString() ?? null,
            endDate: query.endDate?.toISOString() ?? null,
        },
    };

    await cache.set(cacheKey, result, env.CACHE_TTL_DASHBOARD);
    return result;
}

// ─── Category Breakdown ───────────────────────────────────────────────────────

export async function getCategoryBreakdown(
    orgId: string,
    query: CategoryQuery
): Promise<CategoryBreakdown> {
    const cacheKey = buildKey(CacheKeys.dashboardCategories(orgId), query);

    const cached = await cache.get<CategoryBreakdown>(cacheKey);
    if (cached) return cached;

    const rows = await repo.fetchCategoryBreakdown(orgId, query);

    // Compute totals per type for percentage calculation
    const incomeTotal = rows
        .filter((r) => r.type === "INCOME")
        .reduce((sum, r) => sum.plus(r.total), new Decimal(0));

    const expenseTotal = rows
        .filter((r) => r.type === "EXPENSE")
        .reduce((sum, r) => sum.plus(r.total), new Decimal(0));

    const result: CategoryBreakdown = rows.map((r) => {
        const typeTotal = r.type === "INCOME" ? incomeTotal : expenseTotal;
        const rowAmount = new Decimal(r.total);

        const percentage = typeTotal.isZero()
            ? 0
            : rowAmount.div(typeTotal).times(100).toDecimalPlaces(2).toNumber();

        return {
            category: r.category,
            type: r.type,
            total: r.total,
            count: Number(r.count),
            percentage,
        };
    });

    await cache.set(cacheKey, result, env.CACHE_TTL_DASHBOARD);
    return result;
}

// ─── Trends ───────────────────────────────────────────────────────────────────

export async function getTrends(
    orgId: string,
    query: TrendsQuery
): Promise<TrendsResult> {
    const cacheKey = buildKey(CacheKeys.dashboardTrends(orgId), query);

    const cached = await cache.get<TrendsResult>(cacheKey);
    if (cached) return cached;

    const rows = await repo.fetchTrends(orgId, query);

    const result: TrendsResult = rows.map((r) => ({
        period: r.period,
        income: r.income,
        expenses: r.expenses,
        net: r.net,
        recordCount: Number(r.record_count),
    }));

    await cache.set(cacheKey, result, env.CACHE_TTL_DASHBOARD);
    return result;
}

// ─── Recent Activity ──────────────────────────────────────────────────────────

export async function getRecentActivity(
    orgId: string,
    query: RecentQuery
): Promise<RecentActivity> {
    const cacheKey = `${CacheKeys.dashboardRecent(orgId)}:${query.limit}`;

    const cached = await cache.get<RecentActivity>(cacheKey);
    if (cached) return cached;

    const rows = await repo.fetchRecentActivity(orgId, query.limit);

    const result: RecentActivity = rows.map((r) => ({
        id: r.id,
        amount: r.amount,
        type: r.type,
        category: r.category,
        description: r.description,
        date: r.date.toISOString(),
        createdBy: {
            id: r.user_id,
            firstName: r.first_name,
            lastName: r.last_name,
        },
        createdAt: r.created_at.toISOString(),
    }));

    // Shorter TTL for recent — more time-sensitive
    await cache.set(cacheKey, result, Math.floor(env.CACHE_TTL_DASHBOARD / 2));
    return result;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Build a deterministic cache key that includes query params.
 * Sorts keys so param order doesn't create duplicate cache entries.
 */
function buildKey(base: string, params: Record<string, unknown>): string {
    const suffix = Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v instanceof Date ? v.toISOString() : v}`)
        .join("&");

    return suffix ? `${base}:${suffix}` : base;
}
