import { OpenAPIHono } from '@hono/zod-openapi';
import { getAdvisorInsightsController } from '../controllers/advisor.controller';

const advisorRouter = new OpenAPIHono().basePath('/advisor');

advisorRouter.get('/insights', getAdvisorInsightsController);

export { advisorRouter };
