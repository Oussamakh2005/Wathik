import { prisma } from '../config/prismaClient';

export type CustomerCandidate = { id: number; name: string };

export type CustomerMatch =
  | { status: 'matched'; customerId: number; name: string }
  | { status: 'multiple'; candidates: CustomerCandidate[] }
  | { status: 'none' };

export async function matchCustomerByName(rawName: string): Promise<CustomerMatch> {
  const normalized = rawName.trim();
  if (!normalized) return { status: 'none' };

  const matches = await prisma.customer.findMany({
    where: { name: { equals: normalized, mode: 'insensitive' } },
    select: { id: true, name: true },
    take: 5,
  });

  if (matches.length === 0) return { status: 'none' };
  if (matches.length === 1) {
    return { status: 'matched', customerId: matches[0].id, name: matches[0].name };
  }
  return { status: 'multiple', candidates: matches };
}

export async function resolveOrCreateCustomer(name: string): Promise<number> {
  const match = await matchCustomerByName(name);
  if (match.status === 'matched') return match.customerId;
  if (match.status === 'multiple') {
    throw new Error(
      `Multiple customers match "${name}" — pick one and pass customerId`
    );
  }
  const created = await prisma.customer.create({
    data: { name: name.trim() },
    select: { id: true },
  });
  return created.id;
}
