#!/usr/bin/env node
/** Registry CLI. list | get <slug> <path> | validate | rails <slugA> <slugB> */
import { loadRegistry, validateRecord, loadSchema, get, listChains, chainBySlug, sharedRails } from "../src/registry.mjs";

const [command, ...rest] = process.argv.slice(2);
const registry = loadRegistry();
if (command === "list") {
  for (const r of listChains(registry)) console.log(`${r.slug}\t${r.family}\t${r.network}\t${r.caip2.value}`);
} else if (command === "get") {
  console.log(get(chainBySlug(registry, rest[0]), rest[1]));
} else if (command === "rails") {
  console.log(JSON.stringify(sharedRails(chainBySlug(registry, rest[0]), chainBySlug(registry, rest[1])), null, 2));
} else if (command === "validate") {
  const schema = loadSchema();
  let bad = 0;
  for (const r of registry.values()) for (const p of validateRecord(r, schema)) { console.error(`${r.slug}: ${p}`); bad += 1; }
  console.log(bad ? `${bad} problems` : `${registry.size} records valid`);
  process.exit(bad ? 1 : 0);
} else {
  console.error("usage: registry.mjs list | get <slug> <dotted.path> | rails <a> <b> | validate");
  process.exit(2);
}
