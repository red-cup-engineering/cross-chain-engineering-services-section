#!/usr/bin/env node
/**
 * Spin up anvil forks of registry chains from their public RPCs.
 *
 *   node scripts/fork-chains.mjs --chains base,arbitrum-one [--base-port 8600] [--block base=12345,...] [--print]
 *
 * Each chain gets its own anvil on base-port + index, with --chain-id preserved from the registry (a fork keeps
 * the real chain id, so EIP-712 domains and CCTP/Hyperlane domain checks behave as on mainnet). Prints a JSON
 * manifest { slug: { rpc, port, chainId, forkUrl } } and exports TIDEPOOL_RPC_<SLUG> style lines with --print.
 *
 * Forks are heavy: the default is ONE chain (base). Naming several starts several anvils at once; do that on a
 * machine with headroom. Ctrl-C stops every fork.
 */
import { spawn } from "node:child_process";
import { argument } from "./args.mjs";
import { loadRegistry, chainBySlug, get, rpcUrls } from "../src/registry.mjs";

const slugs = (argument("--chains") ?? "base").split(",");
const basePort = Number(argument("--base-port") ?? 8600);
const blocks = Object.fromEntries((argument("--block") ?? "").split(",").filter(Boolean).map((p) => p.split("=")));
const anvil = process.env.ANVIL_BIN ?? "anvil";
const registry = loadRegistry();
const manifest = {};
const children = [];

for (const [index, slug] of slugs.entries()) {
  const record = chainBySlug(registry, slug);
  if (record.family !== "evm") throw new Error(`${slug} is ${record.family}; anvil forks EVM chains only`);
  const [forkUrl] = rpcUrls(record);
  const port = basePort + index;
  const args = ["--fork-url", forkUrl, "--chain-id", String(get(record, "chainId")), "--port", String(port), "--host", "127.0.0.1", "--silent"];
  if (blocks[slug]) args.push("--fork-block-number", blocks[slug]);
  manifest[slug] = { rpc: `http://127.0.0.1:${port}`, port, chainId: get(record, "chainId"), forkUrl };
  if (process.argv.includes("--dry-run")) continue;
  const child = spawn(anvil, args, { stdio: "inherit" });
  children.push(child);
}
console.log(JSON.stringify(manifest, null, 2));
if (process.argv.includes("--print"))
  for (const [slug, m] of Object.entries(manifest)) console.log(`export TIDEPOOL_RPC_${slug.toUpperCase().replaceAll("-", "_")}=${m.rpc}`);
if (process.argv.includes("--dry-run")) process.exit(0);
const stop = () => { for (const c of children) c.kill("SIGTERM"); };
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { stop(); process.exit(0); });
await new Promise(() => {});
