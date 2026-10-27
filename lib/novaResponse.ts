import type { VisionAddressCandidate } from "./novaVisionService.ts";

export function parseNovaAddressResponse(response: unknown): VisionAddressCandidate | null {
  if (!response || typeof response !== "object") return null;
  const json = response as { status?: string; output?: Array<{ type?: string; status?: string; content?: Array<{ type?: string; text?: string }> }> };
  if (json.status !== "completed" || !Array.isArray(json.output)) return null;
  // output_text is an SDK convenience property. Raw HTTP returns message
  // content within output, whose first item may instead be reasoning/tool data.
  const text = json.output.filter(item => item.type === "message" && item.status === "completed")
    .flatMap(item => Array.isArray(item.content) ? item.content : [])
    .filter(part => part.type === "output_text" && typeof part.text === "string")
    .map(part => part.text).join("");
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    if (!value || typeof value !== "object" || typeof value.addressFound !== "boolean" || typeof value.needsConfirmation !== "boolean" || typeof value.confidence !== "number" || !Number.isFinite(value.confidence)) return null;
    const fields = ["houseNumberOrName", "street", "locality", "postcode", "fullAddressCandidate"] as const;
    if (fields.some(field => value[field] !== null && (typeof value[field] !== "string" || (value[field] as string).length > 1000))) return null;
    if (!Array.isArray(value.uncertainFields) || value.uncertainFields.some(item => typeof item !== "string")) return null;
    return {
      addressFound: value.addressFound, needsConfirmation: value.needsConfirmation,
      confidence: Math.max(0, Math.min(1, value.confidence)),
      ...Object.fromEntries(fields.map(field => [field, value[field] || undefined])),
      uncertainFields: value.uncertainFields.slice(0, 8).map(item => item.slice(0, 100)),
    };
  } catch { return null; }
}
