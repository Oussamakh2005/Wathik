import { Context } from "hono";
import axios from "axios";
import FormData from "form-data";
import { createOpenRouterService } from "../services/llm.service";
import { matchCustomerByName } from "../services/customer.service";

export const getInvoiceImage = async (c: Context) => {
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!(file instanceof File)) {
        return c.json({ status: 'error', msg: 'No file uploaded' }, 400);
    }

    console.log(`Processing invoice: name=${file.name}, size=${file.size}, type=${file.type}`);

    try {
        // Step 1: OCR - Extract text from image
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const formData = new FormData();
        formData.append('filename', file.name);
        formData.append('base64Image', buffer.toString('base64'));
        formData.append('isTable', 'true');
        formData.append('apikey', process.env.OCR_API_KEY || '');

        const ocrResponse = await axios.post('https://api.ocr.space/parse/image', formData, {
            headers: formData.getHeaders(),
            timeout: 30000,
        });

        const ocrText = ocrResponse.data.ParsedResults?.[0]?.ParsedText;
        if (!ocrText) {
            return c.json({ status: 'error', msg: 'Failed to extract text from image' }, 400);
        }

        console.log(`OCR extracted ${ocrText.length} characters`);

        const ocrOnlyParam = (c.req.query('ocrOnly') || '').toLowerCase();
        const ocrOnly = ocrOnlyParam === '1' || ocrOnlyParam === 'true' || ocrOnlyParam === 'yes';
        if (ocrOnly) {
            return c.json({
                status: 'ok',
                msg: "OCR extracted successfully",
                rawOCR: ocrText,
            }, 200);
        }

        // Step 2: LLM - Structure OCR text into invoice data
        console.log('LLM request started');
        const llmStart = Date.now();
        const llmService = createOpenRouterService();
        const structuredInvoice = await llmService.structureInvoiceText(ocrText);
        console.log(`LLM response received in ${Date.now() - llmStart}ms`);

        // Step 3: Match extracted customer name against existing customers
        const customerMatch = await matchCustomerByName(structuredInvoice.customerName);

        return c.json({
            status: 'ok',
            msg: "Invoice processed successfully",
            rawOCR: ocrText,
            structured: structuredInvoice,
            customerMatch,
        }, 200);

    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error('Invoice processing error:', errorMessage);
        return c.json({
            status: 'error',
            msg: "Invoice processing failed",
            error: errorMessage,
        }, 500);
    }
}