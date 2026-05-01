import { Context } from 'hono';
import { z } from 'zod';
import { getAdvisorInsights } from '../services/advisor.service';
import { AdvisorPeriod } from '../types/advisor.types';

const AdvisorQuerySchema = z.object({
  period: z.enum(['this_month', 'last_month', 'last_30_days', 'this_week']).default('this_month'),
});

export async function getAdvisorInsightsController(c: Context) {
  try {
    const query = c.req.query();
    const parsed = AdvisorQuerySchema.parse({ period: query.period || 'this_month' });

    const response = await getAdvisorInsights(parsed.period as AdvisorPeriod);

    return c.json({
      status: 'ok',
      data: response,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching advisor insights:', errorMessage);

    return c.json(
      {
        status: 'error',
        msg: 'Failed to fetch advisor insights',
        error: errorMessage,
      },
      500
    );
  }
}
