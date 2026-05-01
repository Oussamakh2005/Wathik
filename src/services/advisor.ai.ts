import { AIInsightRequest, Insight } from '../types/advisor.types';

export class AdvisorAIProvider {
  private apiKey: string;
  private provider: 'openrouter' | 'gemini' | 'mock';

  constructor(apiKey?: string, provider: 'openrouter' | 'gemini' | 'mock' = 'mock') {
    this.apiKey = apiKey || '';
    this.provider = provider;
  }

  async generateInsights(request: AIInsightRequest): Promise<Insight[] | null> {
    if (this.provider === 'mock' || !this.apiKey) {
      console.log('⚠️ AI provider not configured, using rule-based insights');
      return null;
    }

    try {
      const prompt = this.buildPrompt(request);
      const response = await this.callAI(prompt);
      return this.parseInsights(response);
    } catch (error) {
      console.error('AI insight generation failed:', error);
      return null;
    }
  }

  private buildPrompt(request: AIInsightRequest): string {
    const { metrics, anonymizedData, period } = request;

    return `You are a financial advisor for freelancers and small businesses.

Period: ${period}

Financial Metrics:
- Total Sales: ${metrics.totalSales}
- Total Expenses: ${metrics.totalExpenses}
- Net Profit: ${metrics.netProfit}
- Receivables (unpaid): ${metrics.receivablesTotal}
- Payables (owed): ${metrics.payablesTotal}
- Overdue Receivables: ${metrics.overdueReceivablesTotal}
- Overdue Payables: ${metrics.overduePayablesTotal}
- Unpaid Sales Invoices: ${metrics.unpaidSalesInvoicesCount}
- Overdue Sales Invoices: ${metrics.overdueSalesInvoicesCount}

Top Clients (by debt):
${anonymizedData.clients.slice(0, 5).map((c) => `- ${c.ref}: total debt ${c.totalDebt}, overdue ${c.overdueDebt}`).join('\n')}

Top Items (by revenue):
${anonymizedData.items.slice(0, 5).map((i) => `- ${i.ref}: ${i.revenue}`).join('\n')}

Analysis Instructions:
1. Use ONLY the provided numbers. Do not invent missing data.
2. Be concise and practical. Focus on actionable insights.
3. Return ONLY valid JSON array of insights. No extra text.
4. Each insight must have: type (info|warning|critical|opportunity), title, message, priority (1-10), suggestedAction
5. Use anonymized refs only (client_1, item_2, etc).
6. Return empty array if no significant insights.

JSON Schema:
[
  {
    "type": "warning",
    "title": "...",
    "message": "...",
    "priority": 8,
    "suggestedAction": "..."
  }
]`;
  }

  private async callAI(prompt: string): Promise<string> {
    if (this.provider === 'openrouter') {
      return this.callOpenRouter(prompt);
    }
    if (this.provider === 'gemini') {
      return this.callGemini(prompt);
    }
    throw new Error('No valid AI provider configured');
  }

  private async callOpenRouter(prompt: string): Promise<string> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it:free',
        messages: [
          {
            role: 'system',
            content: 'You are a JSON API. Return ONLY valid JSON, no markdown, no explanations.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.5,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenRouter');
    }

    return content;
  }

  private async callGemini(prompt: string): Promise<string> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 1500,
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
      throw new Error('Empty response from Gemini');
    }

    return content;
  }

  private parseInsights(jsonString: string): Insight[] {
    const cleaned = jsonString
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const parsed = JSON.parse(cleaned);
    const insights = Array.isArray(parsed) ? parsed : [parsed];

    return insights
      .filter((i) => i && typeof i === 'object')
      .map((i) => ({
        type: i.type || 'info',
        title: i.title || 'Insight',
        message: i.message || '',
        priority: i.priority || 5,
        suggestedAction: i.suggestedAction || '',
      }));
  }
}

export function createAdvisorAIProvider(): AdvisorAIProvider {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;
  const provider = process.env.OPENROUTER_API_KEY ? 'openrouter' : 'gemini';

  if (!apiKey) {
    console.warn('⚠️  No AI API key configured (OPENROUTER_API_KEY or GEMINI_API_KEY). Using rule-based insights.');
    return new AdvisorAIProvider(undefined, 'mock');
  }

  return new AdvisorAIProvider(apiKey, provider as 'openrouter' | 'gemini');
}
