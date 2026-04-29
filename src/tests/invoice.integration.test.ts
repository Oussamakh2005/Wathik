/**
 * Integration test for invoice processing (OCR + LLM structuring)
 * 
 * Usage:
 *   bun src/tests/invoice.integration.test.ts
 * 
 * Providers:
 *   - Mock: No API calls (always works for testing)
 *   - Gemini: Google AI Studio (requires GEMINI_API_KEY)
 */

import { createMockService, createGeminiService } from '../services/llm.service';
import { StructuredInvoiceSchema } from '../schemas/invoice.schema';

// Sample OCR text (simulating what OCR would extract from an invoice image)
const SAMPLE_OCR_TEXT = `
ACME CORPORATION
Invoice #INV-2024-001

Bill To:
John Doe
123 Main Street
New York, NY 10001

Invoice Date: April 15, 2024
Due Date: May 15, 2024

Items:
1. Consulting Services - 2500.00 x 2 = 5000.00
2. Software License - 1200.00 x 1 = 1200.00
3. Technical Support - 500.00 x 3 = 1500.00

Subtotal: 7700.00
Tax (10%): 770.00
Total: 8470.00

Payment Terms: Net 30
`;

async function testLLMWithProvider(providerName: string, createService: () => any) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🧪 Testing with ${providerName}`);
    console.log(`${'='.repeat(60)}\n`);

    try {
        const llmService = createService();

        console.log('📝 Sample OCR text:');
        console.log('---');
        console.log(SAMPLE_OCR_TEXT.trim());
        console.log('---\n');

        console.log(`⏳ Calling ${providerName}...`);
        const structured = await llmService.structureInvoiceText(SAMPLE_OCR_TEXT);

        console.log(`✅ ${providerName} response received. Validating schema...\n`);
        const validated = StructuredInvoiceSchema.parse(structured);

        console.log('✨ Successfully structured invoice:\n');
        console.log(JSON.stringify(validated, null, 2));

        console.log('\n📊 Verification:');
        console.log(`   ✓ Customer: ${validated.customerName}`);
        console.log(`   ✓ Items: ${validated.items.length}`);
        validated.items.forEach((item, i) => {
            console.log(`     ${i + 1}. ${item.name} - $${item.price} x ${item.amount}`);
        });
        console.log(`   ✓ Total: $${validated.total}`);
        if (validated.dueDate) {
            console.log(`   ✓ Due Date: ${validated.dueDate}`);
        }

        return true;

    } catch (error) {
        console.error(`\n❌ ${providerName} test failed:`, error);
        return false;
    }
}

async function runAllTests() {
    console.log('🚀 Invoice Processing Integration Tests');
    console.log('Testing OCR + LLM structuring pipeline\n');

    const tests = [
        { name: '📦 Mock (Local Testing)', create: () => createMockService() },
        { name: '🔮 Gemini (Google AI Studio)', create: () => createGeminiService() },
    ];

    const results = [];

    for (const test of tests) {
        try {
            const success = await testLLMWithProvider(test.name, test.create);
            results.push({ name: test.name, success });
            
            if (success) {
                console.log(`✅ ${test.name} passed`);
            }
        } catch (err) {
            if (err instanceof Error && err.message.includes('environment variable is required')) {
                console.log(`⏭️  ${test.name} skipped (API key not configured)`);
                results.push({ name: test.name, success: null });
            } else {
                results.push({ name: test.name, success: false });
            }
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('📋 Test Results Summary');
    console.log(`${'='.repeat(60)}\n`);
    
    results.forEach(r => {
        if (r.success === true) {
            console.log(`✅ ${r.name}: PASSED`);
        } else if (r.success === false) {
            console.log(`❌ ${r.name}: FAILED`);
        } else {
            console.log(`⏭️  ${r.name}: SKIPPED`);
        }
    });

    const passed = results.filter(r => r.success === true).length;
    const total = results.filter(r => r.success !== null).length;
    
    console.log(`\n${passed}/${total} tests passed`);
    console.log('\n💡 Setup:');
    console.log('   - Mock service works immediately (no setup needed)');
    console.log('   - For Gemini: Add GEMINI_API_KEY to .env');
    console.log('   - Get Gemini API key: https://aistudio.google.com/apikey');

    return passed === total;
}

// Run tests
runAllTests().then(success => {
    process.exit(success ? 0 : 1);
});
