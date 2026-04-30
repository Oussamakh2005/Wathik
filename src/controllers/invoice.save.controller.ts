import { Context } from "hono";
import { z } from "zod";
import { StructuredInvoiceSchema } from "../schemas/invoice.schema";
import { prisma } from "../config/prismaClient";
import { matchCustomerByName, resolveOrCreateCustomer } from "../services/customer.service";

const SaveInvoiceBodySchema = StructuredInvoiceSchema.extend({
    customerId: z.number().int().positive().optional(),
    updateCustomer: z.boolean().optional(),
    type: z.enum(['SELL', 'BUY']).default('BUY').optional(),
});

/**
 * Save final invoice to database after user confirmation/edits.
 * POST /api/invoice/save
 *
 * Customer linking rules:
 *   - customerId provided → link to that customer.
 *       If customerName differs AND updateCustomer === true → also rename.
 *   - customerId omitted → re-match by name.
 *       Single match → link. None → create. Multiple → 400 (caller must pick).
 */
export const saveInvoice = async (c: Context) => {
    try {
        const raw = await c.req.json();
        const body = SaveInvoiceBodySchema.parse(raw);

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
                        msg: 'Multiple customers match this name — pick one and resend with customerId',
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
                type: body.type || 'BUY',
                total: calculatedTotal,
                status: 'PAID',
                paidAt: new Date(),
                due_date: parseDueDate(body.dueDate),
                customer: { connect: { id: customerId } },
                items: {
                    create: body.items.map(item => ({
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
                msg: "Invoice saved successfully",
                invoiceId: invoice.id,
                customerId,
                invoice,
            },
            201
        );
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error saving invoice:', errorMessage);
        return c.json(
            {
                status: 'error',
                msg: "Failed to save invoice",
                error: errorMessage,
            },
            500
        );
    }
};
