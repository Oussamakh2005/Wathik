import OpenAI from 'openai';
import { StructuredInvoiceSchema, StructuredInvoice, InvoiceItem } from '../schemas/invoice.schema';

interface LLMProviderConfig {
  apiKey: string;
  model: string;
  provider?: 'mock' | 'gemini' | 'openrouter';
  baseUrl?: string;
  timeoutMs?: number;
}

/**
 * Provider-agnostic LLM service that adapts different LLM providers to a unified interface.
 * Supports: Mock (local testing) and Gemini (Google AI Studio).
 */
export class LLMService {
  private config: LLMProviderConfig;
  private openRouterClient?: OpenAI;

  constructor(config: LLMProviderConfig) {
    this.config = {
      provider: 'mock',
      ...config,
    };
  }

  async structureInvoiceText(ocrText: string): Promise<StructuredInvoice> {
    const systemPrompt = [
      'Return ONLY a JSON object. No extra text.',
      'Keys: customerName (string), items (array of {name, price, amount}), total (number), dueDate (ISO8601 string or null).',
      'If a value is missing, use "", 0, [], or null as appropriate.',
      'Example: {"customerName":"","items":[],"total":0,"dueDate":null}',
    ].join('\n');

    const userPrompt = `Extract invoice data from this OCR text:\n\n${ocrText}`;

    if (this.config.provider === 'gemini') {
      return this.callGeminiAPI(systemPrompt, userPrompt);
    }

    if (this.config.provider === 'openrouter') {
      return this.callOpenRouterAPI(systemPrompt, userPrompt);
    }

    return this.callMockLLM(ocrText);
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
    const content = await this.callGeminiContent(systemPrompt, userPrompt);

    try {
      return this.extractStructuredInvoice(content);
    } catch {
      const repairPrompt = [
        'Return ONLY a JSON object. No extra text.',
        'Keys: customerName (string), items (array of {name, price, amount}), total (number), dueDate (ISO8601 string or null).',
        'If a value is missing, use "", 0, [], or null as appropriate.',
        'Example: {"customerName":"","items":[],"total":0,"dueDate":null}',
      ].join('\n');

      const repairUser = `Convert this text into the JSON schema above:\n\n${content}`;
      const repaired = await this.callGeminiContent(repairPrompt, repairUser);

      try {
        return this.extractStructuredInvoice(repaired);
      } catch {
        const heuristic = this.heuristicExtract(content);
        return this.normalizeStructuredInvoice(heuristic);
      }
    }
  }

  private async callOpenRouterAPI(systemPrompt: string, userPrompt: string): Promise<StructuredInvoice> {
    const client = this.getOpenRouterClient();
    const timeoutMs = this.config.timeoutMs ?? 60000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const completion = await client.chat.completions.create({
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      }, {
        signal: controller.signal,
      });

      const messageContent = completion.choices?.[0]?.message?.content;
      const content = this.flattenOpenRouterContent(messageContent);
      if (!content) {
        const upstreamError = (completion as unknown as { error?: { message?: string; code?: number } }).error;
        const finishReason = completion.choices?.[0]?.finish_reason;
        const detail = upstreamError?.message
          ? `upstream ${upstreamError.code ?? '?'}: ${upstreamError.message}`
          : `empty content (finish_reason=${finishReason ?? 'null'})`;
        throw new Error(`No response from OpenRouter (${detail})`);
      }

      return this.extractStructuredInvoice(content);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`OpenRouter request timed out after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private getOpenRouterClient(): OpenAI {
    if (!this.openRouterClient) {
      this.openRouterClient = new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseUrl || 'https://openrouter.ai/api/v1',
        timeout: this.config.timeoutMs ?? 60000,
      });
    }

    return this.openRouterClient;
  }

  private async callGeminiContent(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            temperature: 0,
            topK: 20,
            topP: 0.9,
            maxOutputTokens: 1000,
            response_mime_type: 'application/json',
            responseMimeType: 'application/json',
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

    return content;
  }

  private extractStructuredInvoice(content: string): StructuredInvoice {
    const candidates: string[] = [];

    const mdRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
    let match: RegExpExecArray | null;
    while ((match = mdRegex.exec(content)) !== null) {
      const block = match[1]?.trim();
      if (block) {
        candidates.push(block);
      }
    }

    candidates.push(...this.extractJsonObjects(content));

    const seen = new Set<string>();
    for (const candidate of candidates) {
      if (!candidate || seen.has(candidate)) {
        continue;
      }
      seen.add(candidate);

      try {
        const parsed = JSON.parse(candidate);
        return this.normalizeStructuredInvoice(parsed);
      } catch {
        continue;
      }
    }

    const snippet = content.length > 500 ? `${content.slice(0, 500)}...` : content;
    throw new Error(`Failed to extract JSON from Gemini response. Snippet:\n${snippet}`);
  }

  private flattenOpenRouterContent(content: unknown): string {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => (typeof part?.text === 'string' ? part.text : ''))
        .join('')
        .trim();
    }

    return '';
  }

  private normalizeStructuredInvoice(raw: unknown): StructuredInvoice {
    const source = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
    const customerName = this.toStringValue(source.customerName);
    const total = this.toNumberValue(source.total);
    const itemsRaw = Array.isArray(source.items) ? source.items : [];

    const items = itemsRaw
      .map((item) => this.normalizeItem(item))
      .filter((item) => item.amount > 0);

    const dueDate = this.normalizeDueDate(source.dueDate);

    const normalized: StructuredInvoice = {
      customerName,
      items,
      total,
    };

    if (dueDate) {
      normalized.dueDate = dueDate;
    }

    return StructuredInvoiceSchema.parse(normalized);
  }

  private normalizeItem(raw: unknown): InvoiceItem {
    const source = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
    const name = this.toStringValue(source.name);
    const price = this.toNumberValue(source.price);
    const amountRaw = source.amount ?? source.qty ?? source.quantity;
    const amount = Math.max(0, Math.round(this.toNumberValue(amountRaw)));

    return {
      name,
      price,
      amount,
    };
  }

  private normalizeDueDate(raw: unknown): string | undefined {
    if (typeof raw !== 'string' || !raw.trim()) {
      return undefined;
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }

    return parsed.toISOString();
  }

  private toNumberValue(raw: unknown): number {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return raw;
    }

    if (typeof raw === 'string') {
      const cleaned = raw.replace(/[^0-9.\-]/g, '');
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
  }

  private toStringValue(raw: unknown): string {
    if (typeof raw === 'string') {
      return raw.trim();
    }

    if (raw === null || raw === undefined) {
      return '';
    }

    return String(raw).trim();
  }

  private heuristicExtract(content: string): Record<string, unknown> {
    const customerName = this.matchFirst(content, [
      /customer\s*name\s*:\s*([^\n]+)/i,
      /bill\s*to\s*:\s*([^\n]+)/i,
      /bill\s*to\s+([^\n]+)/i,
      /client\s*:\s*([^\n]+)/i,
      /from\s*:\s*([^\n]+)/i,
    ]);

    const totalRaw = this.matchFirst(content, [
      /grand\s*total\s*[:$]?\s*([0-9.,]+)/i,
      /total\s*[:$]?\s*([0-9.,]+)/i,
      /amount\s*due\s*[:$]?\s*([0-9.,]+)/i,
    ]);

    const dueDate = this.matchFirst(content, [
      /due\s*date\s*:\s*([^\n]+)/i,
      /date\s*:\s*([^\n]+)/i,
    ]);

    return {
      customerName: customerName || '',
      items: [],
      total: totalRaw || '0',
      dueDate: dueDate || undefined,
    };
  }

  private matchFirst(content: string, patterns: RegExp[]): string | undefined {
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return undefined;
  }

  private extractJsonObjects(text: string): string[] {
    const results: string[] = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let escape = false;

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];

      if (inString) {
        if (escape) {
          escape = false;
        } else if (ch === '\\') {
          escape = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === '{') {
        if (depth === 0) {
          start = i;
        }
        depth += 1;
      } else if (ch === '}') {
        if (depth > 0) {
          depth -= 1;
          if (depth === 0 && start >= 0) {
            results.push(text.slice(start, i + 1));
            start = -1;
          }
        }
      }
    }

    return results;
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

  const model = process.env.GEMINI_MODEL || 'gemma-4-31b-it';

  return new LLMService({
    apiKey,
    model,
    provider: 'gemini',
  });
}

/**
 * Create LLM service with OpenRouter (OpenAI-compatible API)
 * Default model: minimax/minimax-m2.5:free
 */
export function createOpenRouterService(): LLMService {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is required');
  }

  const model = process.env.OPENROUTER_MODEL || 'minimax/minimax-m2.5:free';
  const baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
  const timeoutMsRaw = process.env.OPENROUTER_TIMEOUT_MS;
  const timeoutMs = timeoutMsRaw ? Number(timeoutMsRaw) : undefined;
  const safeTimeoutMs = Number.isFinite(timeoutMs) ? timeoutMs : undefined;

  return new LLMService({
    apiKey,
    model,
    provider: 'openrouter',
    baseUrl,
    timeoutMs: safeTimeoutMs,
  });
}
