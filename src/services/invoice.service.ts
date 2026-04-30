import { prisma } from '../config/prismaClient';

const SCORE_BASE = 100;
const SCORE_PENALTY_PER_DAY = 5;

export function calculateInvoiceScore(
  dueDate: Date,
  paidAt: Date | null,
  now: Date = new Date()
): number {
  if (paidAt) {
    const diffMs = paidAt.getTime() - dueDate.getTime();
    const daysDiff = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (daysDiff > 0) {
      return Math.max(0, SCORE_BASE - daysDiff * SCORE_PENALTY_PER_DAY);
    }
    return SCORE_BASE;
  }

  const diffMs = now.getTime() - dueDate.getTime();
  const daysDiff = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (daysDiff > 0) {
    return Math.max(0, SCORE_BASE - daysDiff * SCORE_PENALTY_PER_DAY);
  }
  return SCORE_BASE;
}

export async function updateInvoiceScore(invoiceId: number): Promise<number> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { due_date: true, paidAt: true },
  });

  if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);

  const newScore = calculateInvoiceScore(invoice.due_date, invoice.paidAt);
  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: { score: newScore },
    select: { score: true },
  });

  return updated.score;
}

export async function getCustomerAverageScore(customerId: number, now: Date = new Date()): Promise<number> {
  const invoices = await prisma.invoice.findMany({
    where: { customer_id: customerId },
    select: { due_date: true, paidAt: true },
  });

  if (invoices.length === 0) return 100;

  const scores = invoices.map(inv => calculateInvoiceScore(inv.due_date, inv.paidAt, now));
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(avg);
}

export type FinancialsPeriod = 'today' | 'month' | 'last30days' | 'range';

interface FinancialsFilter {
  period: FinancialsPeriod;
  startDate?: Date;
  endDate?: Date;
}

export interface FinancialsSummary {
  period: FinancialsPeriod;
  startDate: Date;
  endDate: Date;
  revenue: {
    total: number;
    paid: number;
    debt: number;
  };
  expenses: {
    total: number;
    paid: number;
    debt: number;
  };
  netProfit: number;
}

function getDateRange(
  filter: FinancialsFilter,
  now: Date = new Date()
): { startDate: Date; endDate: Date } {
  const endDate = new Date(now);
  endDate.setHours(23, 59, 59, 999);

  let startDate: Date;

  switch (filter.period) {
    case 'today':
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      break;

    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;

    case 'last30days':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
      break;

    case 'range':
      if (!filter.startDate || !filter.endDate) {
        throw new Error('startDate and endDate required for range period');
      }
      startDate = new Date(filter.startDate);
      startDate.setHours(0, 0, 0, 0);
      return { startDate, endDate: new Date(filter.endDate) };

    default:
      throw new Error(`Unknown period: ${filter.period}`);
  }

  return { startDate, endDate };
}

export async function getFinancialsSummary(
  filter: FinancialsFilter
): Promise<FinancialsSummary> {
  const { startDate, endDate } = getDateRange(filter);

  const dateFilter = {
    gte: startDate,
    lte: endDate,
  };

  const [sellInvoices, buyInvoices] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        type: 'SELL',
        createdAt: dateFilter,
      },
      select: {
        total: true,
        status: true,
        paidAt: true,
      },
    }),
    prisma.invoice.findMany({
      where: {
        type: 'BUY',
        createdAt: dateFilter,
      },
      select: {
        total: true,
        status: true,
        paidAt: true,
      },
    }),
  ]);

  const revenue = {
    total: 0,
    paid: 0,
    debt: 0,
  };

  const expenses = {
    total: 0,
    paid: 0,
    debt: 0,
  };

  sellInvoices.forEach((inv) => {
    const amount = Number(inv.total);
    revenue.total += amount;
    if (inv.status === 'PAID') {
      revenue.paid += amount;
    } else {
      revenue.debt += amount;
    }
  });

  buyInvoices.forEach((inv) => {
    const amount = Number(inv.total);
    expenses.total += amount;
    if (inv.status === 'PAID') {
      expenses.paid += amount;
    } else {
      expenses.debt += amount;
    }
  });

  const netProfit = revenue.paid - expenses.paid;

  return {
    period: filter.period,
    startDate,
    endDate,
    revenue,
    expenses,
    netProfit,
  };
}

export async function getCustomerFinancials(customerId: number) {
  const invoices = await prisma.invoice.findMany({
    where: { customer_id: customerId },
    select: {
      type: true,
      total: true,
      status: true,
    },
  });

  let totalSold = 0;
  let totalPaidSold = 0;
  let debtOwedToUs = 0;

  invoices.forEach((inv) => {
    const amount = Number(inv.total);
    if (inv.type === 'SELL') {
      totalSold += amount;
      if (inv.status === 'PAID') {
        totalPaidSold += amount;
      } else {
        debtOwedToUs += amount;
      }
    }
  });

  return {
    totalInvoiced: totalSold,
    totalPaid: totalPaidSold,
    debt: debtOwedToUs,
  };
}
