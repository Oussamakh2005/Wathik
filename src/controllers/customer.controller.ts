import { Context } from 'hono';
import { prisma } from '../config/prismaClient';
import { getCustomerAverageScore, getCustomerFinancials, calculateInvoiceScore } from '../services/invoice.service';

export const getCustomerProfile = async (c: Context) => {
  try {
    const { id } = await c.req.json();
    if (!id || typeof id !== 'number') {
      return c.json(
        { status: 'error', msg: 'Customer ID required' },
        400
      );
    }

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        invoices: {
          include: { items: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!customer) {
      return c.json(
        { status: 'error', msg: `Customer ${id} not found` },
        404
      );
    }

    const [averageScore, financials] = await Promise.all([
      getCustomerAverageScore(id),
      getCustomerFinancials(id),
    ]);

    const now = new Date();
    const invoicesWithScores = customer.invoices.map(inv => ({
      ...inv,
      score: calculateInvoiceScore(inv.due_date, inv.paidAt, now),
    }));

    return c.json({
      status: 'ok',
      customer: {
        ...customer,
        invoices: invoicesWithScores,
        score: averageScore,
      },
      financials,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json(
      {
        status: 'error',
        msg: 'Failed to fetch customer',
        error: errorMessage,
      },
      500
    );
  }
};

export const listCustomers = async (c: Context) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const limit = body.limit || 50;
    const offset = body.offset || 0;

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        include: { invoices: true },
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.customer.count(),
    ]);

    const withScores = await Promise.all(
      customers.map(async (cust) => ({
        ...cust,
        score: await getCustomerAverageScore(cust.id),
      }))
    );

    return c.json({
      status: 'ok',
      customers: withScores,
      pagination: { total, limit, offset },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json(
      {
        status: 'error',
        msg: 'Failed to list customers',
        error: errorMessage,
      },
      500
    );
  }
};

export const createCustomer = async (c: Context) => {
  try {
    const raw = await c.req.json();
    const { name, notes } = raw;

    if (!name || !name.trim()) {
      return c.json(
        { status: 'error', msg: 'Customer name required' },
        400
      );
    }

    const customer = await prisma.customer.create({
      data: {
        name: name.trim(),
        notes: notes
          ? { create: { content: notes } }
          : undefined,
      },
      include: { invoices: true },
    });

    return c.json(
      {
        status: 'ok',
        msg: 'Customer created',
        customer,
      },
      201
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json(
      {
        status: 'error',
        msg: 'Failed to create customer',
        error: errorMessage,
      },
      500
    );
  }
};

export const updateCustomer = async (c: Context) => {
  try {
    const { id, name } = await c.req.json();

    if (!id || typeof id !== 'number') {
      return c.json(
        { status: 'error', msg: 'Customer ID required' },
        400
      );
    }
    if (!name || !name.trim()) {
      return c.json(
        { status: 'error', msg: 'Customer name required' },
        400
      );
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: { name: name.trim() },
      include: { invoices: true },
    });

    return c.json({
      status: 'ok',
      msg: 'Customer updated',
      customer,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json(
      {
        status: 'error',
        msg: 'Failed to update customer',
        error: errorMessage,
      },
      500
    );
  }
};

export const deleteCustomer = async (c: Context) => {
  try {
    const { id } = await c.req.json();
    if (!id || typeof id !== 'number') {
      return c.json(
        { status: 'error', msg: 'Customer ID required' },
        400
      );
    }

    await prisma.customer.delete({
      where: { id },
    });

    return c.json({
      status: 'ok',
      msg: 'Customer deleted',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json(
      {
        status: 'error',
        msg: 'Failed to delete customer',
        error: errorMessage,
      },
      500
    );
  }
};
