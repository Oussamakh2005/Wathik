/**
 * Internal OCR + LLM + Customer-match + Save flow test.
 *
 * Usage:
 *   bun src/tests/ocr.llm.internal.test.ts
 *
 * Notes:
 * - Ensure the API server is running (bun run dev)
 * - Requires OCR_API_KEY and OPENROUTER_API_KEY in environment (used by the server)
 * - Requires DATABASE_URL pointing at a running Postgres for the save step
 *
 * What this verifies:
 *   1. POST /api/invoice returns status==='ok', valid structured payload, and customerMatch.
 *   2. POST /api/invoice/save without customerId resolves-or-creates the customer.
 *   3. A second POST /api/invoice/save with the customerId from (2) links to that same customer.
 */

import { StructuredInvoiceSchema } from "../schemas/invoice.schema";

const API_BASE_URL = process.env.INTERNAL_API_BASE_URL || "http://localhost:3000";
const PIPELINE_ENDPOINT = `${API_BASE_URL}/api/invoice`;
const SAVE_ENDPOINT = `${API_BASE_URL}/api/invoice/save`;

type Structured = ReturnType<typeof StructuredInvoiceSchema.parse>;
type CustomerMatch =
  | { status: 'matched'; customerId: number; name: string }
  | { status: 'multiple'; candidates: Array<{ id: number; name: string }> }
  | { status: 'none' };

async function readJson(response: Response, label: string): Promise<any> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} ${response.status} returned non-JSON body: ${text.slice(0, 500)}`);
  }
}

async function runProcessStep(): Promise<{ structured: Structured; customerMatch: CustomerMatch }> {
  console.log("\n=== Step 1: POST /api/invoice (OCR + LLM + customer match) ===");
  console.log(`Endpoint: ${PIPELINE_ENDPOINT}`);

  const fileUrl = new URL("./invoice/image.png", import.meta.url);
  const file = Bun.file(fileUrl);
  const arrayBuffer = await file.arrayBuffer();
  console.log(`Loaded ${arrayBuffer.byteLength} bytes from ${fileUrl.pathname}`);

  const formData = new FormData();
  formData.append("file", new File([arrayBuffer], "image.png", { type: "image/png" }));

  const startTime = Date.now();
  const response = await fetch(PIPELINE_ENDPOINT, { method: "POST", body: formData });
  console.log(`Response received in ${Date.now() - startTime}ms (status ${response.status})`);

  const data = await readJson(response, 'Pipeline');

  if (!response.ok) {
    throw new Error(
      `Pipeline error ${response.status}: status=${data?.status}, msg=${data?.msg}, error=${data?.error}`
    );
  }

  if (data?.status !== "ok") {
    throw new Error(`Pipeline returned non-ok status: status=${data?.status}, msg=${data?.msg}`);
  }

  if (!data?.rawOCR) {
    throw new Error("No OCR text returned by internal API");
  }

  const structured = StructuredInvoiceSchema.parse(data?.structured);
  const customerMatch = data?.customerMatch as CustomerMatch | undefined;
  if (!customerMatch || !['matched', 'multiple', 'none'].includes(customerMatch.status)) {
    throw new Error(`Pipeline did not return a valid customerMatch (got ${JSON.stringify(customerMatch)})`);
  }

  console.log(`status: ${data.status} | msg: ${data.msg}`);
  console.log(`customerName: "${structured.customerName}"`);
  console.log(`customerMatch:`, JSON.stringify(customerMatch));

  return { structured, customerMatch };
}

async function runSaveStep(
  structured: Structured,
  options: { customerId?: number; updateCustomer?: boolean; label: string }
): Promise<{ invoiceId: number; customerId: number }> {
  console.log(`\n=== ${options.label} ===`);
  console.log(`Endpoint: ${SAVE_ENDPOINT}`);

  const body = {
    ...structured,
    ...(options.customerId ? { customerId: options.customerId } : {}),
    ...(options.updateCustomer ? { updateCustomer: true } : {}),
  };

  const startTime = Date.now();
  const response = await fetch(SAVE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  console.log(`Response received in ${Date.now() - startTime}ms (status ${response.status})`);

  const data = await readJson(response, 'Save');

  if (!response.ok) {
    throw new Error(
      `Save error ${response.status}: status=${data?.status}, msg=${data?.msg}, error=${data?.error}`
    );
  }

  if (data?.status !== "ok") {
    throw new Error(`Save returned non-ok status: status=${data?.status}, msg=${data?.msg}`);
  }

  if (typeof data?.invoiceId !== "number") {
    throw new Error(`Save did not return a numeric invoiceId (got ${data?.invoiceId})`);
  }

  if (typeof data?.customerId !== "number") {
    throw new Error(`Save did not return a numeric customerId (got ${data?.customerId})`);
  }

  console.log(
    `status: ${data.status} | invoiceId: ${data.invoiceId} | customerId: ${data.customerId} | items: ${data.invoice?.items?.length ?? 0}`
  );

  return { invoiceId: data.invoiceId, customerId: data.customerId };
}

async function main() {
  console.log("Starting internal OCR + LLM + Save test...");

  const { structured, customerMatch } = await runProcessStep();

  // Save #1 — caller did NOT pick a customer. Backend re-matches and creates if needed.
  const first = await runSaveStep(structured, { label: 'Step 2a: save without customerId (resolve-or-create)' });

  // Save #2 — simulate the UI passing the now-known customerId. Must link to the same customer row.
  const second = await runSaveStep(structured, {
    customerId: first.customerId,
    label: 'Step 2b: save with customerId (link to existing)',
  });

  if (second.customerId !== first.customerId) {
    throw new Error(
      `Linked customerId mismatch: first=${first.customerId} second=${second.customerId}`
    );
  }

  console.log(
    `\nInternal OCR + LLM + Save test passed.\n  customerMatch.status (process step): ${customerMatch.status}\n  customerId reused across saves: ${first.customerId}\n  invoiceIds: ${first.invoiceId}, ${second.invoiceId}`
  );
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : "Unknown error";
  console.error("\nInternal OCR + LLM + Save test failed:", message);
  process.exit(1);
});
