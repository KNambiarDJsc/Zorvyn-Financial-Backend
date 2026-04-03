/**
 * Financial Record Module Types
 *
 * Public response shapes returned by the service layer.
 * Amounts are serialized as strings to preserve Decimal precision
 * across JSON serialization — never as JS numbers (float risk).
 */

export interface FinancialRecordItem {
    id: string;
    amount: string;        // Decimal serialized as string — client parses
    type: string;
    category: string;
    description: string | null;
    date: string;          // ISO 8601
    createdBy: {
        id: string;
        firstName: string;
        lastName: string;
    };
    createdAt: string;
    updatedAt: string;
}

export interface RecordListResult {
    items: FinancialRecordItem[];
    total: number;
}
