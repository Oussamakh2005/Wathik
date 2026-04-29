import { Hono } from 'hono';
import { cors } from 'hono/cors';
import invoiceRouter from './routers/invoice.router';

const app = new Hono().basePath('/api');
//add cors policy
app.use('/api/*', cors({
  origin : "*"
}));
//add routers  :
app.route('/',invoiceRouter);

export default app
