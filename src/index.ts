import { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { cors } from 'hono/cors';
import invoiceRouter from './routers/invoice.router';

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_API_URL = process.env.PUBLIC_API_URL || `http://localhost:${PORT}`;

const app = new OpenAPIHono().basePath('/api');

app.use('*', cors({ origin: '*' }));

app.route('/', invoiceRouter);

app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: 'Wathik Invoice API',
    version: '1.0.0',
    description: 'OCR + LLM invoice extraction and persistence.',
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
