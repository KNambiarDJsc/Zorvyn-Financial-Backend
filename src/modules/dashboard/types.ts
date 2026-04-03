/**
 * Dashboard Module Types
 *
 * All amounts are strings — Decimal serialization preserves precision.
 * Percentages are numbers (0–100), rounded to 2 decimal places.
 */

// ─── Summary ──────────────────────────────────────────────────────────────────

export interface DashboardSummary {
    totalIncome: string;
    totalExpenses: string;
    netBalance: string;
    recordCount: number;
    incomeCount: number;
    expenseCount: number;
    period: {
        startDate: string | null;
        endDate: string | null;
    };
}

// ─── Category Breakdown ───────────────────────────────────────────────────────

export interface CategoryBreakdownItem {
    category: string;
    type: string;
    total: string;
    count: number;
    percentage: number; // percentage of total income or total expense
}

export type CategoryBreakdown = CategoryBreakdownItem[];

// ─── Trends ───────────────────────────────────────────────────────────────────

export type TrendGranularity = "daily" | "weekly" | "monthly";

export interface TrendDataPoint {
    period: string;       // "2024-01" for monthly, "2024-W03" for weekly, "2024-01-15" for daily
    income: string;
    expenses: string;
    net: string;
    recordCount: number;
}

export type TrendsResult = TrendDataPoint[];

// ─── Recent Activity ──────────────────────────────────────────────────────────

export interface RecentActivityItem {
    id: string;
    amount: string;
    type: string;
    category: string;
    description: string | null;
    date: string;
    createdBy: {
        id: string;
        firstName: string;
        lastName: string;
    };
    createdAt: string;
}

export type RecentActivity = RecentActivityItem[];
