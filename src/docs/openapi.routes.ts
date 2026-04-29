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

// Canonical end-to-end example: this is the actual response the API returned
// for the sample CREATIVE MEDIA invoice. Save-body examples below are paired
// with this exact response so mobile sees the full process → save round-trip.
const SAMPLE_PROCESS_RESPONSE = {
  status: 'ok',
  msg: 'Invoice processed successfully',
  rawOCR:
    'INVOICE\t\r\n' +
    'INVOICE # 24856\tDATE: 01 / 02 / 2020\t\r\n' +
    'Bill to:\tCREATIVE MEDIA\t\r\n' +
    'YOUR COMPANY TAC LINE HERE\t\r\n' +
    'Dwyane Clark\t\r\n' +
    'Company Address,\t\r\n' +
    '24 Dummy Street Area,\t\r\n' +
    'Location, Lorem Ipsum,\tLorem, Ipsum Dolor,\t\r\n' +
    '570xx59x\t\r\n' +
    'QTY\tPRODUCT DESCRIPTION\tPRICE\tTOTAL\t\r\n' +
    '5\tLorem Ipsum Dolor\t$50.00\t$250.00\t\r\n' +
    'Pellentesque id neque ligula\t$10.00\t$10.00\t\r\n' +
    '3\tInterdum et malesuada fames\t$25.00\t$75.00\t\r\n' +
    '2\tVivamus volutpat faucibus\t$40.00\t$80.00\t\r\n' +
    'Subtotal\t$415.00\t\r\n' +
    'Tax Rate\t0.00%\t\r\n' +
    'THANK YOU FOR YOUR BUSINESS\tTOTAL\t$415.00\t\r\n' +
    'Payment is due max 7 days after invoice without deduction.\t\r\n' +
    'Phasellus sollicitudin justo et quam aliquam sollicitudin.\t\r\n' +
    'Signature\t\r\n',
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
    '## End-to-end JSON example: process response → save body',
    '',
    '### 1. What `POST /api/invoice` returned (input you start from):',
    '',
    '```json',
    JSON.stringify(SAMPLE_PROCESS_RESPONSE, null, 2),
    '```',
    '',
    '### 2. What you send to `POST /api/invoice/save` — pick ONE of these depending on what the user chose:',
    '',
    '#### A. User accepts the matched customer (most common)',
    '',
    '```json',
    JSON.stringify({
      ...SAMPLE_STRUCTURED,
      customerId: SAMPLE_PROCESS_RESPONSE.customerMatch.customerId,
      updateCustomer: false,
    }, null, 2),
    '```',
    '',
    '#### B. User edited the matched customer\'s name (rename + link)',
    '',
    '```json',
    JSON.stringify({
      ...SAMPLE_STRUCTURED,
      customerName: 'Creative Media LLC',
      customerId: SAMPLE_PROCESS_RESPONSE.customerMatch.customerId,
      updateCustomer: true,
    }, null, 2),
    '```',
    '',
    '#### C. Create a brand-new customer (no `customerId` — distinct name forces creation)',
    '',
    '```json',
    JSON.stringify({
      ...SAMPLE_STRUCTURED,
      customerName: 'CREATIVE MEDIA (Branch B)',
    }, null, 2),
    '```',
    '',
    '## Mapping rules',
    '',
    '| Process response shape | Save body fields to add |',
    '|---|---|',
    '| `customerMatch.status === "matched"` AND user accepts | `customerId` = `customerMatch.customerId`, `updateCustomer: false` |',
    '| `customerMatch.status === "matched"` AND user renamed | `customerId` = `customerMatch.customerId`, `updateCustomer: true`, new `customerName` |',
    '| `customerMatch.status === "none"` | omit `customerId`; backend creates customer from `customerName` |',
    '| `customerMatch.status === "multiple"` | UI must let user pick from `customerMatch.candidates`; send picked `id` as `customerId` |',
    '',
    '**Gotchas:**',
    '- All `structured.*` fields (`customerName`, `items`, `total`, `dueDate?`) copy verbatim into the save body.',
    '- `dueDate` must be a valid ISO-8601 datetime or omitted entirely. Empty string `""` fails validation.',
    '- Sending `customerName` that exactly matches an existing customer (case-insensitive) without a `customerId` will RE-LINK to that customer, not create a duplicate. Use a distinct name to force creation.',
  ].join('\n'),
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: SaveBodySchema,
          examples: {
            linkToMatchedCustomer: {
              summary: 'Link to the matched customer (paired with process example "matchedCustomer")',
              description: [
                'Use this when `customerMatch.status === "matched"` in the process response and the user accepts the match.',
                'Copy `structured.*` fields verbatim. Set `customerId` to `customerMatch.customerId` from the process response (1 in the example).',
                '`updateCustomer: false` ensures the existing customer row keeps its name.',
              ].join(' '),
              value: {
                ...SAMPLE_STRUCTURED,
                customerId: SAMPLE_PROCESS_RESPONSE.customerMatch.customerId,
                updateCustomer: false,
              },
            },
            createNewCustomerDistinctName: {
              summary: 'Create a brand-new customer (paired with process example "noCustomerMatch", or override match)',
              description: [
                'Use this when `customerMatch.status === "none"`, OR when the user wants to ignore a match and create a fresh customer.',
                'Omit `customerId`. Backend re-matches by `customerName`; if no row matches it creates one.',
                'Note: passing the same name as an existing customer would re-link, not create. Use a distinct name to force creation.',
              ].join(' '),
              value: {
                ...SAMPLE_STRUCTURED,
                customerName: 'CREATIVE MEDIA (Branch B)',
              },
            },
            renameMatchedCustomer: {
              summary: 'Rename the matched customer (paired with process example "matchedCustomer")',
              description: [
                'Use this when `customerMatch.status === "matched"` and the user edited the customer name in the UI.',
                'Pass `customerId` from the match AND `updateCustomer: true` AND the new `customerName`.',
                'Backend renames the customer row before linking the invoice.',
              ].join(' '),
              value: {
                ...SAMPLE_STRUCTURED,
                customerName: 'Creative Media LLC',
                customerId: SAMPLE_PROCESS_RESPONSE.customerMatch.customerId,
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
