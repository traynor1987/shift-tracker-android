import assert from "node:assert/strict";
import test from "node:test";
import { parseNovaAddressResponse } from "../lib/novaResponse.ts";

const candidate = { addressFound: true, houseNumberOrName: "42", street: "Example Road", locality: null, postcode: "L39 2XX", fullAddressCandidate: "42 Example Road, L39 2XX", confidence: 0.9, uncertainFields: [], needsConfirmation: true };
const response = (text: string) => ({ status: "completed", output: [{ type: "reasoning", summary: [] }, { type: "message", status: "completed", content: [{ type: "output_text", text }] }] });
test("Nova reads structured address JSON from raw Responses API output messages", () => {
  const result = parseNovaAddressResponse(response(JSON.stringify(candidate)));
  assert.equal(result?.houseNumberOrName, "42");
  assert.equal(result?.confidence, 0.9);
  assert.equal(result?.needsConfirmation, true);
});
test("Nova never accepts incomplete output, refusals, malformed JSON or invalid field types", () => {
  assert.equal(parseNovaAddressResponse({ ...response(JSON.stringify(candidate)), status: "incomplete" }), null);
  assert.equal(parseNovaAddressResponse({ status: "completed", output: [{ type: "message", status: "completed", content: [{ type: "refusal", refusal: "Cannot read this" }] }] }), null);
  assert.equal(parseNovaAddressResponse(response("not JSON")), null);
  assert.equal(parseNovaAddressResponse(response(JSON.stringify({ ...candidate, street: { malicious: true } }))), null);
  assert.equal(parseNovaAddressResponse(null), null);
});
