import { Context } from "hono";

export const getInvoiceImage = async (c: Context) => {
    const body = await c.req.parseBody();
    const file = body['file']; 

    if (!(file instanceof File)) {
        return c.json({ msg: 'No file uploaded' }, 400);
    }
    console.log(`name : ${file.name} , size : ${file.size} , type : ${file.type}`);

    return c.json({
        name: file.name,
        size: file.size,
        type: file.type,
    }, 200);
}