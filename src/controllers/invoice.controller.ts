import { Context } from "hono";
import axios from "axios";
import { createOpenRouterService, createMockService } from "../services/llm.service";
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

        // Create FormData with file parameter (per OCR.space API docs)
        const formData = new FormData();
        const blob = new Blob([buffer], { type: file.type || 'image/jpeg' });
        formData.append('file', blob, file.name);
        formData.append('isTable', 'true');
        formData.append('apikey', process.env.OCR_API_KEY || '');

        console.log(`OCR Request: filename=${file.name}, size=${file.size}, has_apikey=${!!process.env.OCR_API_KEY}`);

        let ocrResponse;
        try {
            ocrResponse = await axios.post('https://api.ocr.space/parse/image', formData, {
                timeout: 120000,
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
        console.log(`OCR text: ${ocrText.substring(0, 200)}...`);

        const ocrOnlyParam = (c.req.query('ocrOnly') || '').toLowerCase();
        const ocrOnly = ocrOnlyParam === '1' || ocrOnlyParam === 'true' || ocrOnlyParam === 'yes';
        if (ocrOnly) {
            const ocrOnlyResult = {
                status: 'ok',
                msg: "OCR extracted successfully",
                rawOCR: ocrText,
            };
            console.log('Sending OCR-only result:', JSON.stringify(ocrOnlyResult, null, 2));
            return c.json(ocrOnlyResult, 200);
        }

        try {
            // Step 2: LLM - Structure OCR text into invoice data
            console.log('LLM request started');
            const llmStart = Date.now();

            // Use mock LLM if no API key, otherwise use real provider
            let llmService;
            if (process.env.OPENROUTER_API_KEY) {
                llmService = createOpenRouterService();
            } else {
                console.log('Using mock LLM (no OPENROUTER_API_KEY set)');
                llmService = createMockService();
            }
            const structuredInvoice = await llmService.structureInvoiceText(ocrText);
            console.log(`LLM response received in ${Date.now() - llmStart}ms`);
            console.log('Structured invoice:', JSON.stringify(structuredInvoice, null, 2));

            // Step 3: Match extracted customer name against existing customers
            console.log('Matching customer by name:', structuredInvoice.customerName);
            const customerMatch = await matchCustomerByName(structuredInvoice.customerName);
            console.log('Customer match result:', JSON.stringify(customerMatch, null, 2));

            const finalResult = {
                status: 'ok',
                msg: "Invoice processed successfully",
                rawOCR: ocrText,
                structured: structuredInvoice,
                customerMatch,
            };
            console.log('Sending final result to client:', JSON.stringify(finalResult, null, 2));
            return c.json(finalResult, 200);
        } catch (llmErr) {
            const llmErrorMsg = llmErr instanceof Error ? llmErr.message : String(llmErr);
            console.error('LLM/customer processing error:', llmErrorMsg);
            console.error('Full error:', JSON.stringify(llmErr, null, 2));

            // Check for rate limiting
            if (llmErrorMsg.includes('429') || llmErrorMsg.includes('Too Many Requests')) {
                return c.json({
                    status: 'error',
                    msg: "LLM provider rate limited - please try again later",
                    error: llmErrorMsg,
                }, 429);
            }

            // Check for auth/key issues
            if (llmErrorMsg.includes('401') || llmErrorMsg.includes('403') || llmErrorMsg.includes('API key')) {
                return c.json({
                    status: 'error',
                    msg: "LLM provider authentication failed - check API key",
                    error: llmErrorMsg,
                }, 401);
            }

            return c.json({
                status: 'error',
                msg: "Failed to process invoice with LLM",
                error: llmErrorMsg,
            }, 500);
        }

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