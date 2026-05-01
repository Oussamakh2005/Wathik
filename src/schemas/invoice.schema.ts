import { z } from 'zod';

export const InvoiceItemSchema = z.object({
  name: z.string().describe('Item/product name'),
  price: z.number().describe('Unit price'),
  amount: z.number().int().positive().describe('Quantity'),
});

export const InvoiceTypeSchema = z.enum(['SELL', 'BUY']).describe('Invoice type: SELL (revenue) or BUY (expense)');

export const StructuredInvoiceSchema = z.object({
  customerName: z.string().describe('Customer/vendor name'),
  items: z.array(InvoiceItemSchema).describe('List of invoice items'),
  total: z.number().optional().describe('Total amount (calculated if omitted)'),
  dueDate: z.string().describe('Payment due date (YYYY-MM-DD or ISO datetime)'),
});

export const CreateInvoiceSchema = StructuredInvoiceSchema.extend({
  type: InvoiceTypeSchema.default('SELL'),
  customerId: z.number().int().positive().optional(),
  updateCustomer: z.boolean().optional(),
});

export type InvoiceItem = z.infer<typeof InvoiceItemSchema>;
export type StructuredInvoice = z.infer<typeof StructuredInvoiceSchema>;
export type CreateInvoice = z.infer<typeof CreateInvoiceSchema>;
