/**
 * Dashboard Repository
 *
 * All aggregations are computed at the database level using raw SQL.
 * Never pull rows into JS and reduce — at scale that's the difference
 * between a 10ms query and a 10-second timeout.
 *
 * All queries are parameterised (no string interpolation) — safe from
 * SQL injection even though we're using prisma.$queryRaw.
 *
 * Every query is scoped by orgId — multi-tenant isolation enforced here.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../../config/db";
import type { SummaryQuery, CategoryQuery, TrendsQuery } from "./schema";
import type { TrendGranularity } from "./types";

// ─── Raw result types ─────────────────────────────────────────────────────────
// Prisma $queryRaw returns unknown[] — we type the expected shape here

interface SummaryRaw {
    total_income: bigint | string;
    total_expenses: bigint | string;
    net_balance: bigint | string;
    record_count: bigint;
    income_count: bigint;
    expense_count: bigint;
}

interface CategoryRaw {
    category: string;
    type: string;
    total: string;
    count: bigint;
}

interface TrendRaw {
    period: string;
    income: string;
    expenses: string;
    net: string;
    record_count: bigint;
}

interface RecentRaw {
    id: string;
    amount: string;
    type: string;
    category: string;
    description: string | null;
    date: Date;
    user_id: string;
    first_name: string;
    last_name: string;
    created_at: Date;
}

// ─── Summary ──────────────────────────────────────────────────────────────────

export async function fetchSummary(
    orgId: string,
    query: SummaryQuery
): Promise<SummaryRaw> {
    // Build optional date filter clauses
    const dateFilter = buildDateFilter(query.startDate, query.endDate);

    const rows = await prisma.$queryRaw<SummaryRaw[]>`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'INCOME'  THEN amount ELSE 0 END), 0) AS total_income,
      COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) AS total_expenses,
      COALESCE(
        SUM(CASE WHEN type = 'INCOME'  THEN amount ELSE 0 END) -
        SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END),
        0
      ) AS net_balance,
      COUNT(*)                                                              AS record_count,
      COUNT(CASE WHEN type = 'INCOME'  THEN 1 END)                        AS income_count,
      COUNT(CASE WHEN type = 'EXPENSE' THEN 1 END)                        AS expense_count
    FROM financial_records
    WHERE
      org_id   = ${orgId}
      AND is_deleted = false
      ${dateFilter}
  `;

    // $queryRaw always returns an array — grab the single row
    const row = rows[0];
    if (!row) {
        return {
            total_income: "0",
            total_expenses: "0",
            net_balance: "0",
            record_count: BigInt(0),
            income_count: BigInt(0),
            expense_count: BigInt(0),
        };
    }
    return row;
}

// ─── Category Breakdown ───────────────────────────────────────────────────────

export async function fetchCategoryBreakdown(
    orgId: string,
    query: CategoryQuery
): Promise<CategoryRaw[]> {
    const dateFilter = buildDateFilter(query.startDate, query.endDate);
    const typeFilter = query.type
        ? Prisma.sql`AND type = ${query.type}::"RecordType"`
        : Prisma.empty;

    return prisma.$queryRaw<CategoryRaw[]>`
    SELECT
      category,
      type,
      COALESCE(SUM(amount), 0)::TEXT  AS total,
      COUNT(*)                         AS count
    FROM financial_records
    WHERE
      org_id     = ${orgId}
      AND is_deleted = false
      ${dateFilter}
      ${typeFilter}
    GROUP BY
      category, type
    ORDER BY
      SUM(amount) DESC
  `;
}

// ─── Trends ───────────────────────────────────────────────────────────────────

export async function fetchTrends(
    orgId: string,
    query: TrendsQuery
): Promise<TrendRaw[]> {
    const dateFilter = buildDateFilter(query.startDate, query.endDate);
    const truncFn = granularityToTrunc(query.granularity);

    return prisma.$queryRaw<TrendRaw[]>`
    SELECT
      TO_CHAR(DATE_TRUNC(${truncFn}, date), ${periodFormat(query.granularity)}) AS period,
      COALESCE(SUM(CASE WHEN type = 'INCOME'  THEN amount ELSE 0 END), 0)::TEXT AS income,
      COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0)::TEXT AS expenses,
      COALESCE(
        SUM(CASE WHEN type = 'INCOME'  THEN amount ELSE 0 END) -
        SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END),
        0
      )::TEXT AS net,
      COUNT(*) AS record_count
    FROM financial_records
    WHERE
      org_id     = ${orgId}
      AND is_deleted = false
      ${dateFilter}
    GROUP BY
      DATE_TRUNC(${truncFn}, date)
    ORDER BY
      DATE_TRUNC(${truncFn}, date) ASC
  `;
}

// ─── Recent Activity ──────────────────────────────────────────────────────────

export async function fetchRecentActivity(
    orgId: string,
    limit: number
): Promise<RecentRaw[]> {
    return prisma.$queryRaw<RecentRaw[]>`
    SELECT
      fr.id,
      fr.amount::TEXT,
      fr.type,
      fr.category,
      fr.description,
      fr.date,
      u.id         AS user_id,
      u.first_name,
      u.last_name,
      fr.created_at
    FROM financial_records fr
    JOIN users u ON u.id = fr.user_id
    WHERE
      fr.org_id     = ${orgId}
      AND fr.is_deleted = false
    ORDER BY
      fr.created_at DESC
    LIMIT ${limit}
  `;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildDateFilter(
    startDate: Date | undefined,
    endDate: Date | undefined
): Prisma.Sql {
    if (startDate && endDate) {
        return Prisma.sql`AND date >= ${startDate} AND date <= ${endDate}`;
    }
    if (startDate) {
        return Prisma.sql`AND date >= ${startDate}`;
    }
    if (endDate) {
        return Prisma.sql`AND date <= ${endDate}`;
    }
    return Prisma.empty;
}

function granularityToTrunc(granularity: TrendGranularity): string {
    const map: Record<TrendGranularity, string> = {
        daily: "day",
        weekly: "week",
        monthly: "month",
    };
    return map[granularity];
}

function periodFormat(granularity: TrendGranularity): string {
    const map: Record<TrendGranularity, string> = {
        daily: "YYYY-MM-DD",
        weekly: 'IYYY-"W"IW',   // ISO week: 2024-W03
        monthly: "YYYY-MM",
    };
    return map[granularity];
}
