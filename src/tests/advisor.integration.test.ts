/**
 * Integration test for advisor insights endpoint
 *
 * Usage:
 *   bun src/tests/advisor.integration.test.ts
 */

import { prisma } from '../config/prismaClient';
import { getAdvisorInsights } from '../services/advisor.service';

async function testAdvisorEndpoint() {
  console.log('\n=== Advisor Insights Integration Test ===\n');

  try {
    // Create test customer
    const customer = await prisma.customer.create({
      data: {
        name: 'Test Customer',
        score: 100,
      },
    });
    console.log('✓ Created test customer:', customer.id);

    const now = new Date();
    const dueDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 days ago

    // Create SELL invoice (income)
    const sellInvoice = await prisma.invoice.create({
      data: {
        type: 'SELL',
        total: 1000,
        status: 'PENDING',
        due_date: dueDate,
        customer: { connect: { id: customer.id } },
        items: {
          create: [
            { name: 'Product A', price: 500, amount: 2 },
          ],
        },
      },
    });
    console.log('✓ Created SELL invoice:', sellInvoice.id);

    // Create BUY invoice (expense)
    const buyInvoice = await prisma.invoice.create({
      data: {
        type: 'BUY',
        total: 300,
        status: 'PAID',
        due_date: dueDate,
        customer: { connect: { id: customer.id } },
        items: {
          create: [
            { name: 'Supplies', price: 300, amount: 1 },
          ],
        },
      },
    });
    console.log('✓ Created BUY invoice:', buyInvoice.id);

    // Test advisor insights
    const insights = await getAdvisorInsights('this_month');

    console.log('\n=== Advisor Response ===');
    console.log('Period:', insights.period);
    console.log('Source:', insights.source);
    console.log('\nMetrics:');
    console.log('  Total Sales:', insights.metrics.totalSales);
    console.log('  Total Expenses:', insights.metrics.totalExpenses);
    console.log('  Net Profit:', insights.metrics.netProfit);
    console.log('  Receivables (unpaid):', insights.metrics.receivablesTotal);
    console.log('  Overdue Receivables:', insights.metrics.overdueReceivablesTotal);
    console.log('  Overdue Sales Invoices Count:', insights.metrics.overdueSalesInvoicesCount);
    console.log('\nSummary:', insights.summary);
    console.log('\nInsights (' + insights.insights.length + '):');
    insights.insights.forEach((i, idx) => {
      console.log(`  ${idx + 1}. [${i.type}] ${i.title}`);
      console.log(`     ${i.message}`);
    });

    console.log('\nRecommended Actions (' + insights.recommendedActions.length + '):');
    insights.recommendedActions.forEach((a, idx) => {
      console.log(`  ${idx + 1}. ${a.label} (${a.actionType})`);
    });

    // Cleanup
    await prisma.item.deleteMany({ where: {} });
    await prisma.noteInvoice.deleteMany({ where: {} });
    await prisma.invoice.deleteMany({ where: {} });
    await prisma.noteCustomer.deleteMany({ where: {} });
    await prisma.customer.delete({ where: { id: customer.id } });
    console.log('\n✓ Test cleanup complete');
    console.log('\n✅ All tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testAdvisorEndpoint();
