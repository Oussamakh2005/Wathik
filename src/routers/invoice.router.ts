import { OpenAPIHono } from '@hono/zod-openapi';
import { getInvoiceImage } from '../controllers/invoice.controller';
import { saveInvoice } from '../controllers/invoice.save.controller';
import {
  createInvoice,
  getInvoice,
  listInvoices,
  updateInvoice,
  deleteInvoice,
  payInvoice,
} from '../controllers/invoice.crud.controller';
import {
  processRoute,
  saveRoute,
  CreateInvoiceRoute,
  ListInvoicesRoute,
  GetInvoiceRoute,
  UpdateInvoiceRoute,
  DeleteInvoiceRoute,
  PayInvoiceRoute,
} from '../docs/openapi.routes';

const ocrRouter = new OpenAPIHono().basePath('/invoice');
ocrRouter.openapi(processRoute, getInvoiceImage as any);
ocrRouter.openapi(saveRoute, saveInvoice as any);

const crudRouter = new OpenAPIHono().basePath('/invoice');
crudRouter.openapi(CreateInvoiceRoute, createInvoice as any);
crudRouter.openapi(ListInvoicesRoute, listInvoices);
crudRouter.openapi(GetInvoiceRoute, getInvoice);
crudRouter.openapi(UpdateInvoiceRoute, updateInvoice);
crudRouter.openapi(DeleteInvoiceRoute, deleteInvoice);
crudRouter.openapi(PayInvoiceRoute, payInvoice);

export { ocrRouter, crudRouter };
