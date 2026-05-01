/**
 * Internal OCR API test using the sample invoice image.
 *
 * Usage:
 *   bun src/tests/ocr.internal.test.ts
 *
 * Notes:
 * - Ensure the API server is running (bun run dev)
 * - Requires OCR_API_KEY in environment (used by the server)
 */

const API_BASE_URL = process.env.INTERNAL_API_BASE_URL || "http://localhost:3000";
const OCR_ENDPOINT = `${API_BASE_URL}/api/invoice?ocrOnly=1`;

async function runInternalOcrTest() {
  const fileUrl = new URL("./invoice/image.png", import.meta.url);
  const file = Bun.file(fileUrl);
  const arrayBuffer = await file.arrayBuffer();

  const formData = new FormData();
  const uploadFile = new File([arrayBuffer], "image.png", { type: "image/png" });
  formData.append("file", uploadFile);

  const response = await fetch(OCR_ENDPOINT, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Internal OCR API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const rawOcr = (data?.rawOCR || "").toString();

  console.log("OCR extracted text:\n");
  console.log(rawOcr.trim());

  if (!rawOcr) {
    throw new Error("No OCR text returned by internal API");
  }

  const hasInvoice = /invoice/i.test(rawOcr);
  const hasBillTo = /bill\s*to/i.test(rawOcr);

  if (!hasInvoice || !hasBillTo) {
    throw new Error("OCR output missing expected invoice markers");
  }

  console.log("\nInternal OCR test passed");
}

runInternalOcrTest().catch((err) => {
  const message = err instanceof Error ? err.message : "Unknown error";
  console.error("Internal OCR test failed:", message);
  process.exit(1);
});
