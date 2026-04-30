import { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { cors } from 'hono/cors';
import { ocrRouter, crudRouter } from './routers/invoice.router';
import customerRouter from './routers/customer.router';
import financialsRouter from './routers/financials.router';

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_API_URL = process.env.PUBLIC_API_URL || `http://localhost:${PORT}`;

const app = new OpenAPIHono().basePath('/api');

app.use('*', cors({ origin: '*' }));

app.route('/', ocrRouter);
app.route('/', crudRouter);
app.route('/', customerRouter);
app.route('/', financialsRouter);

app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: 'Wathik Invoice API',
    version: '1.0.0',
    description: 'Invoice management with OCR, LLM extraction, customer scoring, and financials.',
  },
  servers: [{ url: PUBLIC_API_URL, description: 'Configured via PUBLIC_API_URL' }],
});

app.get(
  '/docs',
  Scalar({
    url: '/api/openapi.json',
    pageTitle: 'Wathik Invoice API',
  }),
);

export default {
  port: PORT,
  fetch: app.fetch,
};
