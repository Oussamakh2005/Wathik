import { OpenAPIHono } from '@hono/zod-openapi';
import { getInvoiceImage } from '../controllers/invoice.controller';
import { saveInvoice } from '../controllers/invoice.save.controller';
import { processRoute, saveRoute } from '../docs/openapi.routes';

const invoiceRouter = new OpenAPIHono().basePath('/invoice');

invoiceRouter.openapi(processRoute, getInvoiceImage as any);
invoiceRouter.openapi(saveRoute, saveInvoice as any);

export default invoiceRouter;
