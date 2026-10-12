#!/usr/bin/env node
// Rewrite every EVM address in the chain records to EIP-55 form. Idempotent; no network.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { toChecksumAddress } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/evm";
import { CHAINS_DIR, loadRegistry, citedLeaves } from "../src/registry.mjs";

let changed = 0;
for (const [slug, record] of loadRegistry()) {
  if (record.family !== "evm") continue;
  let dirty = false;
  for (const { leaf } of citedLeaves(record))
    if (typeof leaf.value === "string" && /^0x[0-9a-fA-F]{40}$/u.test(leaf.value) && leaf.value !== toChecksumAddress(leaf.value)) {
      leaf.value = toChecksumAddress(leaf.value);
      if (leaf.note?.startsWith("Source lists the address lowercase")) leaf.note = "Source lists the address lowercase; EIP-55 checksum applied by normalize-chain-registry.";
      dirty = true; changed += 1;
    }
  if (dirty) writeFileSync(join(CHAINS_DIR, `${slug}.json`), `${JSON.stringify(record, null, 2)}\n`);
}
console.log(`normalized ${changed} addresses`);
