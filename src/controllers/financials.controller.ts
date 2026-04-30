import { Context } from 'hono';
import { getFinancialsSummary, FinancialsPeriod } from '../services/invoice.service';

export const getFinancials = async (c: Context) => {
  try {
    const period = (c.req.query('period') || 'month') as FinancialsPeriod;
    const startDateStr = c.req.query('startDate');
    const endDateStr = c.req.query('endDate');

    const filter: any = { period };

    if (period === 'range') {
      if (!startDateStr || !endDateStr) {
        return c.json(
          {
            status: 'error',
            msg: 'startDate and endDate required for range period',
          },
          400
        );
      }
      filter.startDate = new Date(startDateStr);
      filter.endDate = new Date(endDateStr);
    }

    const summary = await getFinancialsSummary(filter);

    return c.json({
      status: 'ok',
      summary,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json(
      {
        status: 'error',
        msg: 'Failed to fetch financials',
        error: errorMessage,
      },
      500
    );
  }
};
