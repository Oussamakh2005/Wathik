import { Hono } from "hono";
import { getInvoiceImage } from "../controllers/invoice.controller";

const invoiceRouter = new Hono().basePath('/invoice');

// Get Invoice image 

invoiceRouter.post('/',getInvoiceImage);


export default invoiceRouter;