/** Server-only Nova vision boundary. OPENAI_API_KEY is never exposed to the browser. */
import { jsonError, requirePaidRequest } from "@/lib/hostedServer";
import { readBoundedJson } from "@/lib/hostedLimits";
import { parseNovaAddressResponse } from "@/lib/novaResponse";
export async function POST(request: Request) {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) return Response.json({ error: "VISION_NOT_CONFIGURED" }, { status: 503 });
  let body: { imageDataUrl?: string };
  try { body = await readBoundedJson<typeof body>(request, 8_100_000); } catch (error) { return jsonError(error); }
  if (typeof body.imageDataUrl !== "string" || !body.imageDataUrl || body.imageDataUrl.length > 8_000_000 || !/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(body.imageDataUrl)) return Response.json({ error: "INVALID_IMAGE" }, { status: 400 });
  try { await requirePaidRequest(request, "nova"); } catch (error) { return jsonError(error); }
  const schema = { type: "object", additionalProperties: false, properties: { addressFound: { type: "boolean" }, houseNumberOrName: { type: ["string", "null"] }, street: { type: ["string", "null"] }, locality: { type: ["string", "null"] }, postcode: { type: ["string", "null"] }, fullAddressCandidate: { type: ["string", "null"] }, confidence: { type: "number" }, uncertainFields: { type: "array", items: { type: "string" } }, needsConfirmation: { type: "boolean" } }, required: ["addressFound", "houseNumberOrName", "street", "locality", "postcode", "fullAddressCandidate", "confidence", "uncertainFields", "needsConfirmation"] };
  try {
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", signal: AbortSignal.timeout(30_000), headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.OPENAI_ADDRESS_MODEL ?? "gpt-4.1-mini", max_output_tokens: 768, input: [{ role: "user", content: [{ type: "input_text", text: "Read only the customer delivery destination from this receipt or delivery-app screenshot. Ignore names, phone numbers, order contents, payment details, store addresses and unrelated text. Never guess a missing component. Return null for anything unreadable. Return the structured JSON candidate only." }, { type: "input_image", image_url: body.imageDataUrl, detail: "high" }] }], text: { format: { type: "json_schema", name: "delivery_address", strict: true, schema } } }) });
    if (!response.ok) return Response.json({ error: "VISION_UNAVAILABLE" }, { status: 502 });
    const candidate = parseNovaAddressResponse(await response.json());
    if (!candidate) return Response.json({ error: "NO_ADDRESS" }, { status: 422 });
    return Response.json(candidate);
  } catch { return Response.json({ error: "VISION_UNAVAILABLE" }, { status: 502 }); }
}
