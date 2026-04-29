import { z } from 'zod';

export const InvoiceItemSchema = z.object({
  name: z.string().describe('Item/product name'),
  price: z.number().describe('Unit price'),
  amount: z.number().int().positive().describe('Quantity'),
});

export const StructuredInvoiceSchema = z.object({
  customerName: z.string().describe('Customer/vendor name'),
  items: z.array(InvoiceItemSchema).describe('List of invoice items'),
  total: z.number().describe('Total amount'),
  dueDate: z.string().datetime().optional().describe('Payment due date in ISO format'),
});

export type InvoiceItem = z.infer<typeof InvoiceItemSchema>;
export type StructuredInvoice = z.infer<typeof StructuredInvoiceSchema>;
