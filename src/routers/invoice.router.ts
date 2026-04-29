import { Hono } from "hono";
import { getInvoiceImage } from "../controllers/invoice.controller";
import { saveInvoice } from "../controllers/invoice.save.controller";

const invoiceRouter = new Hono().basePath('/invoice');

// Process invoice image (OCR + LLM structuring)
invoiceRouter.post('/', getInvoiceImage);

// Save final invoice to database
invoiceRouter.post('/save', saveInvoice);

export default invoiceRouter;