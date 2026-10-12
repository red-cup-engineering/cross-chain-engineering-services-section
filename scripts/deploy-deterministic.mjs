#!/usr/bin/env node
/**
 * Deterministic multi-chain deployment of the canary (and the pattern for real contracts).
 *
 *   plan   --deployer 0x.. --label tidepool.canary.v1 --chains base,arbitrum-one [--mode create3]
 *   deploy --deployer 0x.. --label ... --chains ... --rpc slug=http://127.0.0.1:8600,... [--account anvil|env:PRIVATE_KEY]
 *
 * plan reads CreateX on each chain and prints the address the contract will have there; it exits non-zero if the
 * chains disagree. deploy runs contracts/script/DeployDeterministic.s.sol with forge, one chain at a time, against
 * the RPC you name (use fork URLs from fork-chains.mjs for rehearsal). Mainnet broadcast needs a key you supply;
 * this script never holds one. "--account anvil" uses anvil's published dev key and refuses non-local RPCs.
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { argument } from "./args.mjs";
import { loadRegistry, chainBySlug } from "../src/registry.mjs";
import { labelOf, planDeployment } from "../src/deterministic.mjs";

const [command] = process.argv.slice(2);
const deployer = argument("--deployer");
const label = argument("--label") ?? "tidepool.canary.v1";
const slugs = (argument("--chains") ?? "base,arbitrum-one").split(",");
const mode = argument("--mode") ?? "create3";
if (!/^0x[0-9a-fA-F]{40}$/u.test(deployer ?? "")) throw new Error("--deployer 0x<40 hex> is required");
const registry = loadRegistry();
const records = slugs.map((s) => chainBySlug(registry, s));

if (command === "plan") {
  if (mode === "create2") throw new Error("plan --mode create2 needs init code; use the library planDeployment with initCode");
  const plan = await planDeployment(records, { deployer, label: labelOf(label), mode });
  console.log(JSON.stringify(plan, null, 2));
  process.exit(plan.uniform ? 0 : 1);
} else if (command === "deploy") {
  const rpcs = Object.fromEntries((argument("--rpc") ?? "").split(",").filter(Boolean).map((p) => p.split("=")));
  const ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const account = argument("--account") ?? "anvil";
  const section = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const ethereum = resolve(section, "..", "ethereum-engineering-services-section");
  for (const slug of slugs) {
    const rpc = rpcs[slug];
    if (!rpc) throw new Error(`--rpc ${slug}=<url> is required`);
    let key;
    if (account === "anvil") {
      if (!/^http:\/\/(127\.0\.0\.1|localhost):/u.test(rpc)) throw new Error("--account anvil only works against a local RPC");
      key = ANVIL_KEY;
    } else key = process.env[account.replace(/^env:/u, "")];
    if (!key) throw new Error("no signing key available");
    const world = labelOf("tidepool.world.v0");
    const result = spawnSync(process.env.FORGE_BIN ?? "forge", ["script", `${section}/contracts/script/DeployDeterministic.s.sol:DeployDeterministic`, "--root", ethereum, "--rpc-url", rpc, "--broadcast", "--private-key", key, "-vv"], {
      env: { ...process.env, FOUNDRY_PROFILE: "crosschain", BROADCASTER: `0x${deployer.slice(2).toLowerCase().padStart(64, "0")}`, SALT_LABEL: labelOf(label), WORLD: world, MODE: mode },
      stdio: "inherit",
      cwd: ethereum,
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
} else {
  console.error("usage: deploy-deterministic.mjs plan|deploy --deployer 0x.. [--label l] [--chains a,b] [--mode create3|create2] [--rpc slug=url,..]");
  process.exit(2);
}
