import assert from "node:assert/strict";
import test from "node:test";
import { parsePetrolPricePerLitreDraft } from "../lib/domain.ts";

test("petrol price editing accepts intermediate decimal input without forcing formatting", () => {
  assert.equal(parsePetrolPricePerLitreDraft(""), null);
  assert.equal(parsePetrolPricePerLitreDraft("1."), 100);
  assert.equal(parsePetrolPricePerLitreDraft("1.6"), 160);
  assert.equal(parsePetrolPricePerLitreDraft("1,589"), 158.9);
});

test("petrol price editing rejects malformed and negative values", () => {
  assert.equal(parsePetrolPricePerLitreDraft("£1.60"), null);
  assert.equal(parsePetrolPricePerLitreDraft("1.2.3"), null);
  assert.equal(parsePetrolPricePerLitreDraft("-1"), null);
});
