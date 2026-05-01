import { Context } from 'hono';
import { prisma } from '../config/prismaClient';
import { CreateInvoiceSchema } from '../schemas/invoice.schema';
import { resolveOrCreateCustomer, matchCustomerByName } from '../services/customer.service';
import { getCustomerAverageScore, updateInvoiceScore } from '../services/invoice.service';

export const createInvoice = async (c: Context) => {
  try {
    const raw = await c.req.json();
    const body = CreateInvoiceSchema.parse(raw);

    let customerId: number;

    if (body.customerId) {
      const existing = await prisma.customer.findUnique({
        where: { id: body.customerId },
        select: { id: true, name: true },
      });
      if (!existing) {
        return c.json(
          { status: 'error', msg: `Customer ${body.customerId} not found` },
          404
        );
      }
      if (body.updateCustomer && body.customerName.trim() && body.customerName.trim() !== existing.name) {
        await prisma.customer.update({
          where: { id: existing.id },
          data: { name: body.customerName.trim() },
        });
      }
      customerId = existing.id;
    } else {
      const match = await matchCustomerByName(body.customerName);
      if (match.status === 'multiple') {
        return c.json(
          {
            status: 'error',
            msg: 'Multiple customers match — pick one and resend with customerId',
            candidates: match.candidates,
          },
          400
        );
      }
      customerId = await resolveOrCreateCustomer(body.customerName);
    }

    const calculatedTotal = body.total ?? body.items.reduce((sum, item) => sum + item.price * item.amount, 0);

    const parseDueDate = (dateStr: string): Date => {
      if (dateStr.includes('T')) {
        return new Date(dateStr);
      }
      const date = new Date(dateStr + 'T23:59:59Z');
      return date;
    };

    const invoice = await prisma.invoice.create({
      data: {
        type: body.type || 'SELL',
        total: calculatedTotal,
        status: 'PENDING',
        due_date: parseDueDate(body.dueDate),
        customer: { connect: { id: customerId } },
        items: {
          create: body.items.map((item) => ({
            name: item.name,
            price: item.price,
            amount: item.amount,
          })),
        },
      },
      include: {
        items: true,
        customer: true,
      },
    });

    return c.json(
      {
        status: 'ok',
        msg: 'Invoice created successfully',
        invoiceId: invoice.id,
        customerId,
        invoice,
      },
      201
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error creating invoice:', errorMessage);
    return c.json(
      {
        status: 'error',
        msg: 'Failed to create invoice',
        error: errorMessage,
      },
      500
    );
  }
};

export const getInvoice = async (c: Context) => {
  try {
    const { id } = await c.req.json();
    if (!id || typeof id !== 'number') {
      return c.json(
        { status: 'error', msg: 'Invoice ID required' },
        400
      );
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        items: true,
        customer: true,
      },
    });

    if (!invoice) {
      return c.json(
        { status: 'error', msg: `Invoice ${id} not found` },
        404
      );
    }

    return c.json({
      status: 'ok',
      invoice,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json(
      {
        status: 'error',
        msg: 'Failed to fetch invoice',
        error: errorMessage,
      },
      500
    );
  }
};

export const listInvoices = async (c: Context) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const customerId = body.customerId;
    const type = body.type as 'SELL' | 'BUY' | undefined;
    const status = body.status as 'PENDING' | 'PAID' | 'OUTDUE' | undefined;
    const limit = body.limit || 50;
    const offset = body.offset || 0;

    const where: any = {};
    if (customerId) where.customer_id = Number(customerId);
    if (type) where.type = type;
    if (status) where.status = status;

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: { customer: true, items: true },
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.invoice.count({ where }),
    ]);

    return c.json({
      status: 'ok',
      invoices,
      pagination: { total, limit, offset },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json(
      {
        status: 'error',
        msg: 'Failed to list invoices',
        error: errorMessage,
      },
      500
    );
  }
};

export const updateInvoice = async (c: Context) => {
  try {
    const { id, status, dueDate, type } = await c.req.json();
    if (!id || typeof id !== 'number') {
      return c.json(
        { status: 'error', msg: 'Invoice ID required' },
        400
      );
    }

    const updateData: any = {};
    if (status) updateData.status = status;
    if (dueDate) updateData.due_date = new Date(dueDate);
    if (type) updateData.type = type;

    const invoice = await prisma.invoice.update({
      where: { id },
      data: updateData,
      include: { customer: true, items: true },
    });

    return c.json({
      status: 'ok',
      msg: 'Invoice updated',
      invoice,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json(
      {
        status: 'error',
        msg: 'Failed to update invoice',
        error: errorMessage,
      },
      500
    );
  }
};

export const deleteInvoice = async (c: Context) => {
  try {
    const { id } = await c.req.json();
    if (!id || typeof id !== 'number') {
      return c.json(
        { status: 'error', msg: 'Invoice ID required' },
        400
      );
    }

    await prisma.invoice.delete({
      where: { id },
    });

    return c.json({
      status: 'ok',
      msg: 'Invoice deleted',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json(
      {
        status: 'error',
        msg: 'Failed to delete invoice',
        error: errorMessage,
      },
      500
    );
  }
};

export const payInvoice = async (c: Context) => {
  try {
    const { id } = await c.req.json();
    if (!id || typeof id !== 'number') {
      return c.json(
        { status: 'error', msg: 'Invoice ID required' },
        400
      );
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: { status: true, due_date: true, paidAt: true },
    });

    if (!invoice) {
      return c.json(
        { status: 'error', msg: 'Invoice not found' },
        404
      );
    }

    if (invoice.status === 'PAID') {
      return c.json(
        { status: 'error', msg: 'Invoice already paid' },
        400
      );
    }

    const now = new Date();
    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        status: 'PAID',
        paidAt: now,
      },
      select: { score: true },
    });

    const newScore = await updateInvoiceScore(id);

    return c.json({
      status: 'ok',
      msg: 'Payment processed successfully',
      invoiceId: id,
      score: newScore,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json(
      {
        status: 'error',
        msg: 'Payment processing failed',
        error: errorMessage,
      },
      500
    );
  }
};
