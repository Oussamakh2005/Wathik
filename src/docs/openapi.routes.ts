import { createRoute, z } from '@hono/zod-openapi';
import { StructuredInvoiceSchema } from '../schemas/invoice.schema';

const SAMPLE_STRUCTURED = {
  customerName: 'CREATIVE MEDIA',
  items: [
    { name: 'Lorem Ipsum Dolor', price: 50, amount: 5 },
    { name: 'Pellentesque id neque ligula', price: 10, amount: 1 },
    { name: 'Interdum et malesuada fames', price: 25, amount: 3 },
    { name: 'Vivamus volutpat faucibus', price: 40, amount: 2 },
  ],
  total: 415,
};

const SAMPLE_PROCESS_RESPONSE = {
  status: 'ok',
  msg: 'Invoice processed successfully',
  rawOCR: 'INVOICE\nINVOICE # 24856 DATE: 01 / 02 / 2020\nBill to: CREATIVE MEDIA\n...',
  structured: SAMPLE_STRUCTURED,
  customerMatch: {
    status: 'matched',
    customerId: 1,
    name: 'CREATIVE MEDIA',
  },
};

const ProcessFormSchema = z.object({
  file: z.any().openapi({ type: 'string', format: 'binary' }),
}).openapi('InvoiceUpload');

const CustomerCandidateSchema = z.object({
  id: z.number().int(),
  name: z.string(),
}).openapi('CustomerCandidate');

const CustomerMatchSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('matched'),
    customerId: z.number().int(),
    name: z.string(),
  }),
  z.object({
    status: z.literal('multiple'),
    candidates: z.array(CustomerCandidateSchema),
  }),
  z.object({ status: z.literal('none') }),
]).openapi('CustomerMatch');

const ProcessOkSchema = z.object({
  status: z.literal('ok'),
  msg: z.string(),
  rawOCR: z.string(),
  structured: StructuredInvoiceSchema.optional(),
  customerMatch: CustomerMatchSchema.optional(),
}).openapi('InvoiceProcessOk');

const ErrorSchema = z.object({
  status: z.literal('error'),
  msg: z.string(),
  error: z.string().optional(),
  candidates: z.array(CustomerCandidateSchema).optional(),
}).openapi('ErrorResponse');

const SaveBodySchema = StructuredInvoiceSchema.extend({
  customerId: z.number().int().positive().optional().openapi({
    description: 'If user picked an existing customer, pass that ID',
  }),
  updateCustomer: z.boolean().optional().openapi({
    description: 'If true and customerId is set and customerName differs, rename the customer',
  }),
}).openapi('InvoiceSaveRequest');

const SaveOkSchema = z.object({
  status: z.literal('ok'),
  msg: z.string(),
  invoiceId: z.number(),
  customerId: z.number(),
  invoice: z.any().optional(),
}).openapi('InvoiceSaveOk');

export const processRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Invoice'],
  summary: 'Process invoice image',
  description: 'Runs OCR + LLM structuring on an uploaded invoice image. Pass `?ocrOnly=1` to skip the LLM step.',
  request: {
    query: z.object({
      ocrOnly: z.string().optional().openapi({ description: 'Set to 1/true/yes to return raw OCR only', example: '1' }),
    }),
    body: {
      required: true,
      content: { 'multipart/form-data': { schema: ProcessFormSchema } },
    },
  },
  responses: {
    200: {
      description: 'Processed',
      content: {
        'application/json': {
          schema: ProcessOkSchema,
          examples: {
            matchedCustomer: {
              summary: 'OCR + LLM extracted; an existing customer matched the extracted name',
              value: SAMPLE_PROCESS_RESPONSE,
            },
            noCustomerMatch: {
              summary: 'No existing customer matches — caller can create one on save',
              value: {
                ...SAMPLE_PROCESS_RESPONSE,
                customerMatch: { status: 'none' },
              },
            },
            multipleCustomerMatches: {
              summary: 'Multiple customers match — UI must let user pick before save',
              value: {
                ...SAMPLE_PROCESS_RESPONSE,
                customerMatch: {
                  status: 'multiple',
                  candidates: [
                    { id: 1, name: 'CREATIVE MEDIA' },
                    { id: 7, name: 'Creative Media' },
                  ],
                },
              },
            },
          },
        },
      },
    },
    400: { description: 'Bad request', content: { 'application/json': { schema: ErrorSchema } } },
    500: { description: 'Server error', content: { 'application/json': { schema: ErrorSchema } } },
  },
});

export const saveRoute = createRoute({
  method: 'post',
  path: '/save',
  tags: ['Invoice'],
  summary: 'Save invoice',
  description: [
    'Persist a confirmed structured invoice to the database.',
    '',
    'Mobile flow: take the response from `POST /api/invoice` and build the body as follows:',
    '',
    '- **User picked the matched customer** → copy `customerId` from `customerMatch.customerId`. Set `updateCustomer: false` (or omit) unless the user edited the name.',
    '- **User wants a brand-new customer** → omit `customerId`. Send the desired `customerName`. Backend will re-match on the name; if it matches one row it links, otherwise it creates a new customer and links.',
    '- **User edited the matched customer\'s name** → pass `customerId` AND `updateCustomer: true` AND the new `customerName`.',
    '',
    'Note: `dueDate` must be a valid ISO-8601 datetime or omitted entirely. Empty string fails validation.',
  ].join('\n'),
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: SaveBodySchema,
          examples: {
            linkToMatchedCustomer: {
              summary: 'User picked the customer that matched (customerMatch.status === "matched")',
              description: 'Pass `customerId` from the process response. Backend links the new invoice to that customer without renaming.',
              value: {
                ...SAMPLE_STRUCTURED,
                customerId: 1,
                updateCustomer: false,
              },
            },
            createNewCustomerDistinctName: {
              summary: 'Create a brand-new customer (different name)',
              description: 'Omit `customerId`. Use a name that does not collide with any existing customer; backend creates the customer and links the invoice.',
              value: {
                ...SAMPLE_STRUCTURED,
                customerName: 'CREATIVE MEDIA (Branch B)',
              },
            },
            renameMatchedCustomer: {
              summary: 'User edited the matched customer\'s name',
              description: 'Pass `customerId` AND `updateCustomer: true`. The customer row is renamed before the invoice is linked.',
              value: {
                ...SAMPLE_STRUCTURED,
                customerName: 'Creative Media LLC',
                customerId: 1,
                updateCustomer: true,
              },
            },
          },
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Saved',
      content: {
        'application/json': {
          schema: SaveOkSchema,
          example: {
            status: 'ok',
            msg: 'Invoice saved successfully',
            invoiceId: 42,
            customerId: 1,
            invoice: {
              id: 42,
              customer_id: 1,
              total: '415.00',
              status: 'PENDING',
              items: [
                { id: 101, name: 'Lorem Ipsum Dolor', price: '50.00', amount: 5 },
              ],
            },
          },
        },
      },
    },
    400: {
      description: 'Ambiguous customer match',
      content: {
        'application/json': {
          schema: ErrorSchema,
          example: {
            status: 'error',
            msg: 'Multiple customers match this name — pick one and resend with customerId',
            candidates: [
              { id: 1, name: 'CREATIVE MEDIA' },
              { id: 7, name: 'Creative Media' },
            ],
          },
        },
      },
    },
    404: { description: 'Customer not found', content: { 'application/json': { schema: ErrorSchema } } },
    500: { description: 'Server error', content: { 'application/json': { schema: ErrorSchema } } },
  },
});
