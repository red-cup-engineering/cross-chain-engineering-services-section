/**
 * Cross-chain chain registry: load, validate, and query the per-chain records
 * under data/records/chain-records. Pure data access; no network. The verifier
 * (scripts/verify-chain-registry.mjs) is the only thing that talks to chains.
 *
 * A record leaf is a Cited value { value, source, readAt, ... }. `get` returns
 * the bare value and refuses null: a datum that was looked for and not found
 * must be handled by the caller, never read as zero.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateJsonSchema } from "@red-cup-engineering/json-schema-services-section/validation";
import { toChecksumAddress } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/evm";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REGISTRY_DIR = resolve(HERE, "..", "data", "records");
export const CHAINS_DIR = join(REGISTRY_DIR, "chain-records");
export const SCHEMA_PATH = resolve(HERE, "..", "schemas", "chain.schema.json");

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/u;

export function loadSchema(path = SCHEMA_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Load every chain record. Returns a Map in slug order. */
export function loadRegistry({ chainsDir = CHAINS_DIR } = {}) {
  const records = new Map();
  for (const file of readdirSync(chainsDir).filter((name) => name.endsWith(".json")).sort()) {
    const record = JSON.parse(readFileSync(join(chainsDir, file), "utf8"));
    if (`${record.slug}.json` !== file) throw new Error(`${file}: slug ${record.slug} does not match file name`);
    records.set(record.slug, record);
  }
  return records;
}

/** Validate one record against the schema plus the invariants a schema cannot express. Returns an array of problems. */
export function validateRecord(record, schema = loadSchema()) {
  const problems = [];
  const result = validateJsonSchema(record, schema);
  if (!result.valid) for (const issue of result.issues ?? []) problems.push(`${issue.instancePath ?? issue.path ?? ""} ${issue.message ?? issue.kind}`.trim());
  for (const { path, leaf } of citedLeaves(record)) {
    if (typeof leaf.value === "string" && EVM_ADDRESS.test(leaf.value) && record.family === "evm" && leaf.value !== toChecksumAddress(leaf.value))
      problems.push(`${path}: address is not EIP-55 checksummed`);
    if (leaf.value === null && !leaf.notFound) problems.push(`${path}: null value without notFound`);
    if (leaf.value !== null && leaf.notFound) problems.push(`${path}: notFound set on a present value`);
  }
  if (record.family === "evm" && record.caip2?.value !== `eip155:${record.chainId?.value}`) problems.push("caip2 does not match chainId");
  return problems;
}

/** Every Cited leaf in a record, as { path, leaf }. A Cited leaf is an object that carries `source` and `readAt` and a `value` key. */
export function* citedLeaves(node, path = "") {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) yield* citedLeaves(node[i], `${path}[${i}]`);
  } else if (node && typeof node === "object") {
    if ("value" in node && "source" in node && "readAt" in node) yield { path, leaf: node };
    else for (const [key, child] of Object.entries(node)) yield* citedLeaves(child, path ? `${path}.${key}` : key);
  }
}

/** Leaves that are addresses (EVM hex or Solana base58) with a non-null value. */
export function addressLeaves(record) {
  return [...citedLeaves(record)].filter(({ path, leaf }) => leaf.value !== null && typeof leaf.value === "string" && (EVM_ADDRESS.test(leaf.value) || (record.family === "solana" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u.test(leaf.value) && !path.startsWith("caip2") && !path.startsWith("chainId") && !path.includes("symbol") && !path.includes("kind"))));
}

function walk(record, dotted) {
  let node = record;
  for (const part of dotted.split(".")) {
    if (node === undefined || node === null) return undefined;
    const index = part.match(/^(\w+)\[(\d+)\]$/u);
    node = index ? node[index[1]]?.[Number(index[2])] : node[part];
  }
  return node;
}

/** The Cited leaf at a dotted path, or undefined. */
export const leafAt = (record, dotted) => walk(record, dotted);

/** The bare value at a dotted path. Throws if the path is absent or the datum was not found. */
export function get(record, dotted) {
  const leaf = walk(record, dotted);
  if (leaf === undefined) throw new RangeError(`${record.slug}: no field ${dotted}`);
  if (leaf.value === null) throw new RangeError(`${record.slug}: ${dotted} not found (${leaf.notFound})`);
  return leaf.value;
}

/** Like get, but returns null instead of throwing for a not-found datum. */
export function getOrNull(record, dotted) {
  const leaf = walk(record, dotted);
  return leaf === undefined || leaf.value === null ? null : leaf.value;
}

export const listChains = (registry, { family, network } = {}) =>
  [...registry.values()].filter((r) => (!family || r.family === family) && (!network || r.network === network));

export function chainBySlug(registry, slug) {
  const record = registry.get(slug);
  if (!record) throw new RangeError(`unknown chain "${slug}" (known: ${[...registry.keys()].join(", ")})`);
  return record;
}

export const chainByCaip2 = (registry, caip2) => [...registry.values()].find((r) => r.caip2.value === caip2);

/** Chains where every named dotted path has a present value. Use to ask "which chains support CCTP v2". */
export const chainsWith = (registry, ...paths) => listChains(registry).filter((r) => paths.every((p) => getOrNull(r, p) !== null));

/** First RPC URL that verification did not mark unreachable/wrong-chain (unverified records count). */
export function rpcUrls(record) {
  return record.rpc.filter((r) => !["unreachable", "wrong-chain"].includes(r.verification?.result)).map((r) => r.url);
}

/** The cross-chain fact table for an EVM pair, used by routing code: what rails does a -> b share. */
export function sharedRails(a, b) {
  const rails = [];
  if (getOrNull(a, "cctp.tokenMessengerV2") && getOrNull(b, "cctp.tokenMessengerV2")) rails.push({ rail: "cctp-v2", fromDomain: get(a, "cctp.domain"), toDomain: get(b, "cctp.domain") });
  if (getOrNull(a, "hyperlane.mailbox") && getOrNull(b, "hyperlane.mailbox")) rails.push({ rail: "hyperlane", fromDomain: get(a, "hyperlane.domainId"), toDomain: get(b, "hyperlane.domainId") });
  if (getOrNull(a, "layerzero.endpointV2") && getOrNull(b, "layerzero.endpointV2")) rails.push({ rail: "layerzero-v2", fromEid: get(a, "layerzero.eid"), toEid: get(b, "layerzero.eid") });
  if (getOrNull(a, "ccip.router") && getOrNull(b, "ccip.router")) rails.push({ rail: "ccip", fromSelector: get(a, "ccip.chainSelector"), toSelector: get(b, "ccip.chainSelector") });
  return rails;
}
