import { OpenAPIHono } from '@hono/zod-openapi';
import { getFinancials } from '../controllers/financials.controller';
import { FinancialsRoute } from '../docs/openapi.routes';

const financialsRouter = new OpenAPIHono().basePath('/financials');

financialsRouter.openapi(FinancialsRoute, getFinancials as any);

export default financialsRouter;
