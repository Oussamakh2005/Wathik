export type AdvisorPeriod = 'this_month' | 'last_month' | 'last_30_days' | 'this_week';

export interface AdvisorMetrics {
  totalSales: number;
  totalExpenses: number;
  netProfit: number;
  receivablesTotal: number;
  payablesTotal: number;
  overdueReceivablesTotal: number;
  overduePayablesTotal: number;
  unpaidSalesInvoicesCount: number;
  overdueSalesInvoicesCount: number;
}

export type InsightType = 'info' | 'warning' | 'critical' | 'opportunity';

export interface Insight {
  type: InsightType;
  title: string;
  message: string;
  priority: number;
  suggestedAction: string;
  entities?: Array<{
    type: 'client' | 'item' | 'supplier';
    id: string | number;
    displayName: string;
  }>;
}

export interface RecommendedAction {
  label: string;
  actionType: string;
  entityType?: string;
  entityId?: string | number;
}

export interface AdvisorResponse {
  period: AdvisorPeriod;
  metrics: AdvisorMetrics;
  summary: string;
  insights: Insight[];
  recommendedActions: RecommendedAction[];
  source: 'ai' | 'rules';
  missingMetrics?: string[];
}

export interface AIInsightRequest {
  period: AdvisorPeriod;
  metrics: Record<string, unknown>;
  anonymizedData: {
    clients: Array<{ ref: string; totalDebt: number; overdueDebt: number }>;
    items: Array<{ ref: string; revenue: number }>;
  };
}
