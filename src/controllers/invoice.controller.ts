import { Context } from "hono";
import axios from "axios";
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
        const base64Data = buffer.toString('base64');

        const params = new URLSearchParams();
        params.append('base64Image', base64Data);
        params.append('isTable', 'true');
        params.append('apikey', process.env.OCR_API_KEY || '');
        params.append('filetype', file.type || 'image/jpeg');

        console.log(`OCR Request: filename=${file.name}, base64_size=${base64Data.length}, has_apikey=${!!process.env.OCR_API_KEY}`);

        let ocrResponse;
        try {
            ocrResponse = await axios.post('https://api.ocr.space/parse/image', params, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 30000,
                validateStatus: () => true,
            });
        } catch (axiosErr) {
            const errMsg = axiosErr instanceof Error ? axiosErr.message : String(axiosErr);
            console.error(`OCR Axios error (before response):`, errMsg);
            throw axiosErr;
        }

        console.log(`OCR Response: status=${ocrResponse.status}, statusText=${ocrResponse.statusText}`);
        console.log(`OCR Response body:`, JSON.stringify(ocrResponse.data, null, 2));

        if (ocrResponse.status !== 200) {
            const errorDetail = ocrResponse.data?.error?.message || ocrResponse.data?.error || JSON.stringify(ocrResponse.data);
            console.error(`OCR API error (${ocrResponse.status}):`, errorDetail);
            return c.json({ status: 'error', msg: `OCR failed with status ${ocrResponse.status}`, detail: errorDetail }, 400);
        }

        const ocrText = ocrResponse.data.ParsedResults?.[0]?.ParsedText;
        if (!ocrText) {
            console.error('OCR returned no text:', JSON.stringify(ocrResponse.data));
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