/**
 * OCR test for the sample invoice image.
 *
 * Usage:
 *   bun src/tests/ocr.invoice.test.ts
 */

import { ocrSpace } from "ocr-space-api-wrapper";

async function runOcrTest() {
  const apiKey = process.env.OCR_API_KEY;
  if (!apiKey) {
    throw new Error("OCR_API_KEY environment variable is required");
  }

  const fileUrl = new URL("./invoice/image.png", import.meta.url);
  const file = Bun.file(fileUrl);
  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const dataUrl = `data:image/png;base64,${base64}`;

  const ocrResponse = await ocrSpace(dataUrl, {
    apiKey,
    isTable: true,
    language: "eng",
  });

  const ocrText = ocrResponse.ParsedResults?.[0]?.ParsedText ?? "";
  if (!ocrText) {
    throw new Error("OCR did not return any text");
  }

  console.log("OCR extracted text:\n");
  console.log(ocrText.trim());

  // Basic sanity checks
  const hasInvoice = /invoice/i.test(ocrText);
  const hasBillTo = /bill\s*to/i.test(ocrText);

  if (!hasInvoice || !hasBillTo) {
    throw new Error("OCR output missing expected invoice markers");
  }

  console.log("\nOCR test passed");
}

runOcrTest().catch((err) => {
  const message = err instanceof Error ? err.message : "Unknown error";
  console.error("OCR test failed:", message);
  process.exit(1);
});
