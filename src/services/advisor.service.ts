import { prisma } from '../config/prismaClient';
import { AdvisorPeriod, AdvisorMetrics, AdvisorResponse, Insight, RecommendedAction } from '../types/advisor.types';
import { PrivacyMapper, AnonymizedClient, AnonymizedItem } from './advisor.privacy';
import { AdvisorAIProvider } from './advisor.ai';

function getDateRange(period: AdvisorPeriod, now: Date = new Date()): { startDate: Date; endDate: Date } {
  const endDate = new Date(now);
  endDate.setHours(23, 59, 59, 999);

  let startDate: Date;

  switch (period) {
    case 'this_month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;

    case 'last_month':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate.setDate(0);
      endDate.setHours(23, 59, 59, 999);
      break;

    case 'last_30_days':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
      break;

    case 'this_week':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - startDate.getDay());
      startDate.setHours(0, 0, 0, 0);
      break;

    default:
      throw new Error(`Unknown period: ${period}`);
  }

  return { startDate, endDate };
}

export async function getAdvisorInsights(period: AdvisorPeriod): Promise<AdvisorResponse> {
  const { startDate, endDate } = getDateRange(period);

  const dateFilter = { gte: startDate, lte: endDate };

  const [sellInvoices, buyInvoices] = await Promise.all([
    prisma.invoice.findMany({
      where: { type: 'SELL', createdAt: dateFilter },
      include: { items: true, customer: true },
    }),
    prisma.invoice.findMany({
      where: { type: 'BUY', createdAt: dateFilter },
      include: { items: true, customer: true },
    }),
  ]);

  const metrics: AdvisorMetrics = {
    totalSales: 0,
    totalExpenses: 0,
    netProfit: 0,
    receivablesTotal: 0,
    payablesTotal: 0,
    overdueReceivablesTotal: 0,
    overduePayablesTotal: 0,
    unpaidSalesInvoicesCount: 0,
    overdueSalesInvoicesCount: 0,
  };

  const now = new Date();

  sellInvoices.forEach((inv) => {
    const amount = Number(inv.total);
    metrics.totalSales += amount;

    if (inv.status !== 'PAID') {
      metrics.receivablesTotal += amount;

      if (inv.due_date < now) {
        metrics.overdueReceivablesTotal += amount;
        metrics.overdueSalesInvoicesCount++;
      } else {
        metrics.unpaidSalesInvoicesCount++;
      }
    }
  });

  buyInvoices.forEach((inv) => {
    const amount = Number(inv.total);
    metrics.totalExpenses += amount;

    if (inv.status !== 'PAID') {
      metrics.payablesTotal += amount;

      if (inv.due_date < now) {
        metrics.overduePayablesTotal += amount;
      }
    }
  });

  metrics.netProfit = metrics.totalSales - metrics.totalExpenses;

  const privacyMapper = new PrivacyMapper();

  const clientDebts = new Map<number, { total: number; overdue: number }>();
  sellInvoices.forEach((inv) => {
    if (inv.status !== 'PAID') {
      const amount = Number(inv.total);
      const existing = clientDebts.get(inv.customer_id) || { total: 0, overdue: 0 };
      existing.total += amount;
      if (inv.due_date < now) {
        existing.overdue += amount;
      }
      clientDebts.set(inv.customer_id, existing);
    }
  });

  const anonymizedClients: AnonymizedClient[] = Array.from(clientDebts.entries())
    .sort(([, a], [, b]) => b.total - a.total)
    .map(([customerId, debt]) => ({
      realId: customerId,
      ref: privacyMapper.anonymizeClient(customerId),
      totalDebt: debt.total,
      overdueDebt: debt.overdue,
    }));

  const itemRevenues = new Map<number, number>();
  sellInvoices.forEach((inv) => {
    inv.items.forEach((item) => {
      const revenue = Number(item.price) * item.amount;
      itemRevenues.set(item.id, (itemRevenues.get(item.id) || 0) + revenue);
    });
  });

  const anonymizedItems: AnonymizedItem[] = Array.from(itemRevenues.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([itemId, revenue]) => ({
      realId: itemId,
      ref: privacyMapper.anonymizeItem(itemId),
      name: '', // Will fetch separately if needed
      revenue,
    }));

  const aiProvider = new AdvisorAIProvider(process.env.OPENROUTER_API_KEY, 'openrouter');

  let insights: Insight[] = [];
  let source: 'ai' | 'rules' = 'rules';

  const aiRequest = {
    period,
    metrics,
    anonymizedData: {
      clients: anonymizedClients,
      items: anonymizedItems,
    },
  };

  const aiInsights = await aiProvider.generateInsights(aiRequest);
  if (aiInsights && aiInsights.length > 0) {
    insights = aiInsights;
    source = 'ai';
  } else {
    insights = generateRuleBasedInsights(metrics, anonymizedClients, anonymizedItems);
  }

  const recommendedActions = generateRecommendedActions(metrics, anonymizedClients, privacyMapper);

  const summary = generateSummary(metrics, period);

  return {
    period,
    metrics,
    summary,
    insights,
    recommendedActions,
    source,
  };
}

function generateRuleBasedInsights(
  metrics: AdvisorMetrics,
  clients: AnonymizedClient[],
  items: AnonymizedItem[]
): Insight[] {
  const insights: Insight[] = [];

  if (metrics.overdueReceivablesTotal > 0) {
    insights.push({
      type: 'critical',
      title: 'مبالغ متأخرة من العملاء',
      message: `لديك ${metrics.overdueSalesInvoicesCount} فاتورة متأخرة بقيمة ${metrics.overdueReceivablesTotal.toFixed(2)}`,
      priority: 9,
      suggestedAction: 'إرسال تذكيرات بالدفع للعملاء المتأخرين',
    });
  }

  if (metrics.overduePayablesTotal > 0) {
    insights.push({
      type: 'warning',
      title: 'التزامات متأخرة',
      message: `لديك مبالغ متأخرة بقيمة ${metrics.overduePayablesTotal.toFixed(2)}`,
      priority: 8,
      suggestedAction: 'سداد المبالغ المتأخرة في أسرع وقت',
    });
  }

  if (metrics.totalSales > 0 && metrics.totalExpenses > metrics.totalSales) {
    insights.push({
      type: 'warning',
      title: 'الأرباح سالبة',
      message: `المصروفات (${metrics.totalExpenses.toFixed(2)}) تتجاوز المبيعات (${metrics.totalSales.toFixed(2)})`,
      priority: 9,
      suggestedAction: 'مراجعة المصروفات وتقليلها',
    });
  }

  if (clients.length > 0 && clients[0].totalDebt > metrics.totalSales * 0.2) {
    const topClient = clients[0];
    insights.push({
      type: 'warning',
      title: 'عميل ذو ديون كبيرة',
      message: `${topClient.ref} لديه ديون بقيمة ${topClient.totalDebt.toFixed(2)}`,
      priority: 7,
      suggestedAction: 'التواصل مع العميل حول الدفع',
      entities: [{ type: 'client', id: topClient.realId, displayName: topClient.ref }],
    });
  }

  if (items.length > 0) {
    const topItem = items[0];
    insights.push({
      type: 'opportunity',
      title: 'منتج يحقق إيرادات عالية',
      message: `${topItem.ref} حقق ${topItem.revenue.toFixed(2)} في الإيرادات`,
      priority: 6,
      suggestedAction: 'التركيز على هذا المنتج وتسويقه أكثر',
    });
  }

  if (metrics.receivablesTotal > metrics.totalExpenses && metrics.totalExpenses > 0) {
    insights.push({
      type: 'info',
      title: 'رصيد حسابات دائنة كبير',
      message: `لديك ${metrics.unpaidSalesInvoicesCount} فاتورة غير مدفوعة بقيمة ${metrics.receivablesTotal.toFixed(2)}`,
      priority: 5,
      suggestedAction: 'متابعة تحصيل الفواتير القديمة',
    });
  }

  return insights;
}

function generateRecommendedActions(
  metrics: AdvisorMetrics,
  clients: AnonymizedClient[],
  mapper: PrivacyMapper
): RecommendedAction[] {
  const actions: RecommendedAction[] = [];

  if (metrics.overdueSalesInvoicesCount > 0) {
    actions.push({
      label: 'إرسال تذكيرات للعملاء',
      actionType: 'send_reminders',
      entityType: 'client',
    });
  }

  if (clients.length > 0) {
    const topClient = clients[0];
    actions.push({
      label: `متابعة ${topClient.ref}`,
      actionType: 'contact_client',
      entityType: 'client',
      entityId: topClient.realId,
    });
  }

  return actions;
}

function generateSummary(metrics: AdvisorMetrics, period: AdvisorPeriod): string {
  const periodText = {
    this_month: 'هذا الشهر',
    last_month: 'الشهر الماضي',
    last_30_days: 'آخر 30 يوم',
    this_week: 'هذا الأسبوع',
  }[period];

  const profit = metrics.netProfit.toFixed(2);
  const status =
    metrics.netProfit > 0 ? `موجب (+${profit})` : `سالب (${profit})`;

  return `في ${periodText}: المبيعات ${metrics.totalSales.toFixed(2)}, المصروفات ${metrics.totalExpenses.toFixed(2)}, الربح ${status}. لديك ${metrics.unpaidSalesInvoicesCount} فاتورة غير مدفوعة بقيمة ${metrics.receivablesTotal.toFixed(2)}.`;
}
