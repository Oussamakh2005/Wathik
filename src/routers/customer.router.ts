import { OpenAPIHono } from '@hono/zod-openapi';
import {
  getCustomerProfile,
  listCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from '../controllers/customer.controller';
import {
  CreateCustomerRoute,
  GetCustomerRoute,
  UpdateCustomerRoute,
  DeleteCustomerRoute,
  ListCustomersRoute,
} from '../docs/openapi.routes';

const customerRouter = new OpenAPIHono().basePath('/customers');

customerRouter.openapi(CreateCustomerRoute, createCustomer);
customerRouter.openapi(GetCustomerRoute, getCustomerProfile);
customerRouter.openapi(UpdateCustomerRoute, updateCustomer);
customerRouter.openapi(DeleteCustomerRoute, deleteCustomer);
customerRouter.openapi(ListCustomersRoute, listCustomers);

export default customerRouter;
