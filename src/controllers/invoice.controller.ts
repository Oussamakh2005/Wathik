import { Context } from "hono";
import { ocrSpace } from "ocr-space-api-wrapper";
export const getInvoiceImage = async (c: Context) => {
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!(file instanceof File)) {
        return c.json({ msg: 'No file uploaded' }, 400);
    }
    console.log(`name : ${file.name} , size : ${file.size} , type : ${file.type}`);
    const arrayBuffer = await file.arrayBuffer()
    const base64String = Buffer.from(arrayBuffer).toString('base64')
    const mimeType = file.type
    // Create a Data URL (optional)
    const dataUrl = `data:${mimeType};base64,${base64String}`
    //OCR
    try {
        const respose = await ocrSpace(dataUrl, { apiKey: process.env.OCR_API_KEY });
        return c.json({
            msg: "Text extracted successfully",
            data : respose.ParsedResults[0].ParsedText
        }, 500);
    } catch (err) {
        return c.json({
            msg: "Something went wrong"
        }, 500);
    }
}