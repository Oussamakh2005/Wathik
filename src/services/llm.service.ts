import { StructuredInvoiceSchema, StructuredInvoice } from '../schemas/invoice.schema';

interface LLMProviderConfig {
  apiKey: string;
  model: string;
  provider?: 'mock' | 'gemini';
  baseUrl?: string;
}

/**
 * Provider-agnostic LLM service that adapts different LLM providers to a unified interface.
 * Supports: Mock (local testing) and Gemini (Google AI Studio).
 */
export class LLMService {
  private config: LLMProviderConfig;

  constructor(config: LLMProviderConfig) {
    this.config = {
      provider: 'mock',
      ...config,
    };
  }

  async structureInvoiceText(ocrText: string): Promise<StructuredInvoice> {
    const systemPrompt = `Output ONLY a JSON object. Nothing else. No text before or after.
Respond with only the JSON matching this exact format:
{"customerName":"string","items":[{"name":"string","price":number,"amount":number}],"total":number,"dueDate":null}`;

    const userPrompt = `${ocrText}`;

    if (this.config.provider === 'gemini') {
      return this.callGeminiAPI(systemPrompt, userPrompt);
    } else {
      return this.callMockLLM(ocrText);
    }
  }

  private callMockLLM(ocrText: string): Promise<StructuredInvoice> {
    console.log('📦 Using mock LLM (local testing, no API calls)');
    
    const mockResponse: StructuredInvoice = {
      customerName: 'ACME CORPORATION',
      items: [
        { name: 'Consulting Services', price: 2500, amount: 2 },
        { name: 'Software License', price: 1200, amount: 1 },
        { name: 'Technical Support', price: 500, amount: 3 },
      ],
      total: 8470,
      dueDate: '2024-05-15T00:00:00Z',
    };

    return Promise.resolve(mockResponse);
  }

  private async callGeminiAPI(systemPrompt: string, userPrompt: string): Promise<StructuredInvoice> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: `${systemPrompt}\n\n${userPrompt}` },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            topK: 20,
            topP: 0.9,
            maxOutputTokens: 1000,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error('No response from Gemini API');
    }

    console.error('📦 Gemini response length:', content.length);
    console.error('📦 Contains ```:', content.includes('```'));
    console.error('📦 First 200 chars:', content.substring(0, 200));
    console.error('📦 Last 200 chars:', content.substring(Math.max(0, content.length - 200)));

    let jsonString: string;
    
    // Find markdown code blocks containing { and }
    // Try different markdown patterns
    let allMdBlocks = content.match(/```[\s\S]*?```/g);
    console.error('🔍 Found', allMdBlocks?.length || 0, 'markdown blocks (pattern 1)');
    
    if (!allMdBlocks || allMdBlocks.length === 0) {
      // Try simpler pattern
      allMdBlocks = content.match(/```[^`]*?```/g);
      console.error('🔍 Found', allMdBlocks?.length || 0, 'markdown blocks (pattern 2)');
    }
    
    if (allMdBlocks && allMdBlocks.length > 0) {
      // Extract content from each block and find the one with JSON
      for (let i = 0; i < allMdBlocks.length; i++) {
        const block = allMdBlocks[i];
        // Remove the ``` markers
        const candidate = block.replace(/```/g, '').trim();
        console.error(`  Block ${i}: ${candidate.substring(0, 50)}...`);
        // Skip candidates that look like schema examples (containing "number" or "string" keywords)
        if (candidate.includes('"number"') || candidate.includes(':number') || candidate.includes(':string')) {
          console.error(`    → Skipped (schema example)`);
          continue;
        }
        // Try to parse as JSON
        try {
          const parsed = JSON.parse(candidate);
          // Verify it looks like valid invoice data
          if (parsed.customerName && parsed.total !== undefined) {
            console.error(`    → ✅ Valid invoice JSON`);
            jsonString = candidate;
            break;
          }
        } catch (e) {
          // Not valid JSON, continue to next block
          console.error(`    → Invalid JSON: ${e.message}`);
          continue;
        }
      }
    }
    
    // If no valid markdown JSON block found, try substring extraction
    if (!jsonString) {
      const startIdx = content.indexOf('{');
      const endIdx = content.lastIndexOf('}');
      
      if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
        throw new Error(`Failed to extract JSON from Gemini response:\n${content}`);
      }
      
      jsonString = content.substring(startIdx, endIdx + 1);
    }

    // Clean up
    jsonString = jsonString.trim();

    const parsed = JSON.parse(jsonString);
    return StructuredInvoiceSchema.parse(parsed);
  }
}

/**
 * Create mock LLM service for local testing (no API calls)
 */
export function createMockService(): LLMService {
  return new LLMService({
    apiKey: 'mock',
    model: 'mock',
    provider: 'mock',
  });
}

/**
 * Create LLM service with Gemini (via Google AI Studio)
 * Uses Gemma 4 31B IT model (the best available Gemma model)
 */
export function createGeminiService(): LLMService {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required');
  }

  return new LLMService({
    apiKey,
    model: 'gemma-4-31b-it',
    provider: 'gemini',
  });
}
