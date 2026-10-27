import assert from "node:assert/strict";
import test from "node:test";
import { novaAddressCandidateText, resolveDeliveryAddressDrafts } from "../lib/deliveryAddressFlow.ts";

test("blank and manual addresses execute without a provider lookup", async () => {
  let calls = 0;
  const result = await resolveDeliveryAddressDrafts({
    drafts: ["", "42 Moor Street, Ormskirk L39 2XX"], count: 2, source: "manual", googleValidationEnabled: true,
    matches: [], confirmed: [], attempted: [],
    lookup: async () => { calls += 1; return { ok: false, reason: "GOOGLE_ADDRESS_UNAVAILABLE", cacheHit: false }; },
  });
  assert.equal(calls, 1);
  assert.equal(result.destinations.length, 1);
  assert.equal(result.destinations[0].postcode, "L39 2XX");
  assert.equal(result.lookupFailed, true);
});

test("Google validation success returns a confirmable coordinate-only match", async () => {
  const result = await resolveDeliveryAddressDrafts({
    drafts: ["42 Moor Street, Ormskirk L39 2XX"], count: 1, source: "manual", googleValidationEnabled: true,
    matches: [], confirmed: [], attempted: [],
    lookup: async () => ({ ok: true, cacheHit: false, value: { displayName: "42 Moor Street, Ormskirk L39 2XX", houseNumberOrName: "42", street: "Moor Street", locality: "Ormskirk", postcode: "L39 2XX", latitude: 53.568, longitude: -2.888, confidence: "high" } }),
  });
  assert.equal(result.awaitingConfirmation, true);
  assert.deepEqual(result.destinations[0].destination, { latitude: 53.568, longitude: -2.888 });
  assert.equal(result.matches[0]?.displayName, "42 Moor Street, Ormskirk L39 2XX");
});

test("validation disabled and provider failure both preserve a startable local address", async () => {
  let calls = 0;
  const disabled = await resolveDeliveryAddressDrafts({ drafts: ["Moor Street L39 2XX"], count: 1, source: "pasted", googleValidationEnabled: false, matches: [], confirmed: [], attempted: [], lookup: async () => { calls += 1; return { ok: false, reason: "GOOGLE_ADDRESS_UNAVAILABLE", cacheHit: false }; } });
  assert.equal(calls, 0);
  assert.equal(disabled.lookupFailed, false);
  assert.equal(disabled.destinations[0].addressSource, "pasted");

  const failed = await resolveDeliveryAddressDrafts({ drafts: ["Moor Street L39 2XX"], count: 1, source: "manual", googleValidationEnabled: true, matches: [], confirmed: [], attempted: [], lookup: async () => { throw new Error("offline"); } });
  assert.equal(failed.lookupFailed, true);
  assert.equal(failed.awaitingConfirmation, false);
  assert.equal(failed.destinations[0].postcode, "L39 2XX");
  assert.equal(failed.destinations[0].privacyStatus, "precise");
});

test("Nova candidate extraction creates the same transient address draft path", () => {
  const text = novaAddressCandidateText({ addressFound: true, confidence: 0.96, needsConfirmation: true, houseNumberOrName: "42", street: "Moor Street", locality: "Ormskirk", postcode: "L39 2XX" });
  assert.equal(text, "42\nMoor Street\nOrmskirk\nL39 2XX");
});
