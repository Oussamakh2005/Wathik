import { Context } from "hono";
import { StructuredInvoiceSchema } from "../schemas/invoice.schema";
import { prisma } from "../config/prismaClient";

/**
 * Save final invoice to database after user confirmation/edits
 * POST /api/invoices/save
 * 
 * Body:
 * {
 *   "customerName": "John Doe",
 *   "items": [{"name": "Service", "price": 100, "amount": 2}],
 *   "total": 200,
 *   "dueDate": "2024-05-15T00:00:00Z"
 * }
 */
export const saveInvoice = async (c: Context) => {
    try {
        const body = await c.req.json();

        // Validate structured data
        const validated = StructuredInvoiceSchema.parse(body);

        // Save to database in a transaction
        const invoice = await prisma.invoice.create({
            data: {
                total: validated.total,
                status: 'PENDING',
                due_date: validated.dueDate ? new Date(validated.dueDate) : new Date(),
                items: {
                    create: validated.items.map(item => ({
                        name: item.name,
                        price: item.price,
                        amount: item.amount,
                    })),
                },
                notes: {
                    create: [
                        {
                            content: `Invoice auto-created from OCR processing\nCustomer: ${validated.customerName}`,
                        },
                    ],
                },
            },
            include: {
                items: true,
                notes: true,
            },
        });

        return c.json(
            {
                msg: "Invoice saved successfully",
                invoiceId: invoice.id,
                invoice,
            },
            201
        );
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error saving invoice:', errorMessage);
        return c.json(
            {
                msg: "Failed to save invoice",
                error: errorMessage,
            },
            500
        );
    }
};
