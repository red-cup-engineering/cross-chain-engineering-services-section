import test from "node:test";
import assert from "node:assert/strict";
import { loadRegistry, loadSchema, validateRecord, get, getOrNull, chainsWith, sharedRails, citedLeaves, addressLeaves } from "../src/registry.mjs";

const registry = loadRegistry();
const schema = loadSchema();

test("registry carries the required chain set", () => {
  const slugs = [...registry.keys()].sort();
  for (const slug of ["base", "arbitrum-one", "optimism", "gnosis", "ethereum", "polygon-pos", "celo", "base-sepolia", "arbitrum-sepolia", "op-sepolia", "gnosis-chiado", "ethereum-sepolia", "hive", "solana"])
    assert.ok(slugs.includes(slug), `missing ${slug}`);
});

test("every record validates against the schema and its invariants", () => {
  for (const record of registry.values()) assert.deepEqual(validateRecord(record, schema), [], record.slug);
});

test("every cited leaf names a source and a read date", () => {
  for (const record of registry.values())
    for (const { path, leaf } of citedLeaves(record)) {
      assert.match(leaf.source, /^(https:\/\/|\/home\/)/u, `${record.slug}.${path} source`);
      assert.match(leaf.readAt, /^\d{4}-\d{2}-\d{2}$/u, `${record.slug}.${path} readAt`);
    }
});

test("an address is never invented: null values carry notFound", () => {
  const gnosis = registry.get("gnosis");
  assert.equal(getOrNull(gnosis, "cctp.tokenMessengerV2"), null);
  assert.throws(() => get(gnosis, "cctp.tokenMessengerV2"), /not found/u);
});

test("CCTP v2 chains are exactly the ones Circle lists among our set", () => {
  const cctp = chainsWith(registry, "cctp.tokenMessengerV2").map((r) => r.slug).sort();
  assert.deepEqual(cctp, ["arbitrum-one", "arbitrum-sepolia", "base", "base-sepolia", "ethereum", "ethereum-sepolia", "op-sepolia", "optimism", "polygon-pos"]);
});

test("sharedRails reports the rails two chains have in common", () => {
  const rails = sharedRails(registry.get("base"), registry.get("arbitrum-one")).map((r) => r.rail);
  assert.deepEqual(rails, ["cctp-v2", "hyperlane", "layerzero-v2", "ccip"]);
  const gnosisBase = sharedRails(registry.get("gnosis"), registry.get("base")).map((r) => r.rail);
  assert.ok(!gnosisBase.includes("cctp-v2"));
});

test("addressLeaves finds EVM and Solana addresses", () => {
  assert.ok(addressLeaves(registry.get("base")).length > 20);
  assert.ok(addressLeaves(registry.get("solana")).length >= 8);
});

test("testnets point at a mainnet in the registry", () => {
  for (const r of registry.values()) if (r.network === "testnet") assert.ok(registry.get(r.testnetOf), r.slug);
});
