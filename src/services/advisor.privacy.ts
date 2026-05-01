import { Customer, Invoice, Item } from '@prisma/client';

export interface AnonymizedClient {
  realId: number;
  ref: string;
  totalDebt: number;
  overdueDebt: number;
}

export interface AnonymizedItem {
  realId: number;
  ref: string;
  name: string;
  revenue: number;
}

export class PrivacyMapper {
  private clientMap: Map<number, string> = new Map();
  private itemMap: Map<number, string> = new Map();
  private clientCounter = 0;
  private itemCounter = 0;

  anonymizeClient(customerId: number): string {
    if (!this.clientMap.has(customerId)) {
      this.clientCounter++;
      this.clientMap.set(customerId, `client_${this.clientCounter}`);
    }
    return this.clientMap.get(customerId)!;
  }

  anonymizeItem(itemId: number): string {
    if (!this.itemMap.has(itemId)) {
      this.itemCounter++;
      this.itemMap.set(itemId, `item_${this.itemCounter}`);
    }
    return this.itemMap.get(itemId)!;
  }

  getClientRef(customerId: number): string | undefined {
    return this.clientMap.get(customerId);
  }

  getItemRef(itemId: number): string | undefined {
    return this.itemMap.get(itemId);
  }

  getAllClientMappings(): { realId: number; ref: string }[] {
    return Array.from(this.clientMap.entries()).map(([realId, ref]) => ({ realId, ref }));
  }

  getAllItemMappings(): { realId: number; ref: string }[] {
    return Array.from(this.itemMap.entries()).map(([realId, ref]) => ({ realId, ref }));
  }
}

export function sanitizeDataForAI(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (
      key.toLowerCase().includes('name') &&
      typeof value === 'string' &&
      !key.includes('Anonymized')
    ) {
      continue;
    }
    if (
      key.toLowerCase().includes('email') ||
      key.toLowerCase().includes('phone') ||
      key.toLowerCase().includes('address') ||
      key.toLowerCase().includes('note')
    ) {
      continue;
    }
    sanitized[key] = value;
  }

  return sanitized;
}
