#!/usr/bin/env node
/**
 * Verify registry addresses on-chain and stamp the result into each record.
 *
 *   node scripts/verify-chain-registry.mjs [--chains base,gnosis] [--groups usdc,cctp,eas,erc4337,create2] [--all] [--write]
 *
 * Default scope is Tidepool v0.1: base, base-sepolia, gnosis, arbitrum-one;
 * groups usdc, cctp, eas, erc4337, create2. --all widens to every chain and group.
 *
 * Strictly serial (one request at a time, small pause) so it is safe on a
 * loaded machine and polite to public RPCs. Uses raw JSON-RPC eth_getCode,
 * which is what `cast code` issues; a non-empty result is "verified".
 * Where a contract exposes a cheap getter that restates a registry datum
 * (symbol, localDomain, eid, getChainId, VERSION), the getter is called too
 * and the comparison recorded as probe.matchesRegistry.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { argument } from "./args.mjs";
import { CHAINS_DIR, loadRegistry, citedLeaves } from "../src/registry.mjs";
import { rpcAny, rpcOnce, ethCall, decodeAbiString } from "../src/rpc.mjs";

const DEFAULT_CHAINS = ["base", "base-sepolia", "gnosis", "arbitrum-one"];
const GROUPS = {
  usdc: ["usdc.address"],
  cctp: ["cctp.tokenMessengerV2", "cctp.messageTransmitterV2", "cctp.tokenMinterV2", "cctp.tokenMessengerMinterV2", "cctp.messageTransmitterV2"],
  eas: ["eas.eas", "eas.schemaRegistry"],
  erc4337: ["erc4337.entryPointV07", "erc4337.entryPointV08"],
  create2: ["create2.createX", "create2.arachnidProxy"],
  hyperlane: ["hyperlane.mailbox", "hyperlane.interchainGasPaymaster", "hyperlane.staticMessageIdMultisigIsmFactory", "hyperlane.staticAggregationIsmFactory", "hyperlane.domainRoutingIsmFactory", "hyperlane.validatorAnnounce", "hyperlane.merkleTreeHook"],
  layerzero: ["layerzero.endpointV2", "layerzero.sendUln302", "layerzero.receiveUln302", "layerzero.executor"],
  ccip: ["ccip.router"],
  safe: ["safe.singleton", "safe.singletonL2", "safe.proxyFactory"],
  misc: ["permit2", "multicall3"],
};
const DATE = new Date().toISOString().slice(0, 10);
const write = process.argv.includes("--write");
const all = process.argv.includes("--all");
const chains = all ? null : (argument("--chains") ?? DEFAULT_CHAINS.join(",")).split(",");
const groups = all ? Object.keys(GROUPS) : (argument("--groups") ?? "usdc,cctp,eas,erc4337,create2").split(",");
const pause = () => new Promise((r) => setTimeout(r, 250));

// selector -> probe description
const PROBES = {
  "usdc.address": { sig: "symbol()", data: "0x95d89b41", expect: () => "USDC", decode: decodeAbiString },
  "cctp.messageTransmitterV2": { sig: "localDomain()", data: "0x8d3638f4", expect: (r) => r.cctp.domain.value, decode: (h) => Number(BigInt(h)) },
  "hyperlane.mailbox": { sig: "localDomain()", data: "0x8d3638f4", expect: (r) => r.hyperlane.domainId.value, decode: (h) => Number(BigInt(h)) },
  "layerzero.endpointV2": { sig: "eid()", data: "0x416ecebf", expect: (r) => r.layerzero.eid.value, decode: (h) => Number(BigInt(h)) },
  "multicall3": { sig: "getChainId()", data: "0x3408e470", expect: (r) => r.chainId.value, decode: (h) => Number(BigInt(h)) },
  "safe.singleton": { sig: "VERSION()", data: "0xffa1ad74", expect: () => "1.4.1", decode: decodeAbiString },
};

async function verifyEvm(record) {
  const urls = record.rpc.map((r) => r.url);
  let working = null;
  for (const entry of record.rpc) {
    const started = Date.now();
    try {
      const id = await rpcOnce(entry.url, "eth_chainId", []);
      const ok = Number(BigInt(id)) === Number(record.chainId.value);
      entry.verification = { verifiedAt: DATE, result: ok ? "reachable" : "wrong-chain", latencyMs: Date.now() - started };
      if (ok && !working) working = entry.url;
    } catch (error) {
      entry.verification = { verifiedAt: DATE, result: "unreachable", detail: String(error.message).slice(0, 100) };
    }
    await pause();
  }
  if (!working) return { slug: record.slug, error: "no reachable RPC" };
  const order = [working, ...urls.filter((u) => u !== working)];
  const { result: head } = await rpcAny(order, "eth_blockNumber", []);
  const block = Number(BigInt(head));
  // finality measurement
  try {
    const { result: fin } = await rpcAny(order, "eth_getBlockByNumber", ["finalized", false]);
    const { result: lat } = await rpcAny(order, "eth_getBlockByNumber", ["latest", false]);
    record.finality.measured = { measuredAt: DATE, finalizedTag: true, lagBlocks: Number(BigInt(lat.number) - BigInt(fin.number)), lagSeconds: Number(BigInt(lat.timestamp) - BigInt(fin.timestamp)) };
  } catch (error) {
    record.finality.measured = { measuredAt: DATE, finalizedTag: false, detail: String(error.message).slice(0, 100) };
  }
  const summary = { slug: record.slug, verified: 0, noCode: 0, unreachable: 0, probeMismatch: [] };
  const wanted = new Set(groups.flatMap((g) => GROUPS[g] ?? []));
  for (const { path, leaf } of citedLeaves(record)) {
    if (!wanted.has(path) || leaf.value === null) continue;
    const verification = { method: "eth_getCode", rpc: working, block, codeBytes: null, verifiedAt: DATE, result: "unreachable" };
    try {
      const { result: code } = await rpcAny(order, "eth_getCode", [leaf.value, "latest"]);
      verification.codeBytes = (code.length - 2) / 2;
      verification.result = verification.codeBytes > 0 ? "verified" : "no-code";
    } catch { /* stays unreachable */ }
    await pause();
    const probe = PROBES[path];
    if (probe && verification.result === "verified") {
      try {
        const { result } = await ethCall(order, leaf.value, probe.data);
        const returned = probe.decode(result);
        verification.probe = { call: probe.sig, returned, matchesRegistry: returned === probe.expect(record) };
        if (!verification.probe.matchesRegistry) summary.probeMismatch.push(`${path}: ${probe.sig} returned ${returned}`);
      } catch (error) {
        verification.probe = { call: probe.sig, returned: null, matchesRegistry: false };
      }
      await pause();
    }
    leaf.verification = verification;
    if (verification.result === "verified") summary.verified += 1; else if (verification.result === "no-code") summary.noCode += 1; else summary.unreachable += 1;
  }
  return summary;
}

async function verifySolana(record) {
  const urls = record.rpc.map((r) => r.url);
  const { result: genesis, url } = await rpcAny(urls, "getGenesisHash", []);
  if (genesis !== record.chainId.value) return { slug: "solana", error: `genesis mismatch ${genesis}` };
  const summary = { slug: "solana", verified: 0, noCode: 0, unreachable: 0, probeMismatch: [] };
  for (const { path, leaf } of citedLeaves(record)) {
    if (typeof leaf.value !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/u.test(leaf.value) || ["caip2", "chainId"].includes(path) || /symbol|kind/u.test(path)) continue;
    const verification = { method: "getAccountInfo", rpc: url, block: null, codeBytes: null, verifiedAt: DATE, result: "unreachable" };
    try {
      const { result } = await rpcAny(urls, "getAccountInfo", [leaf.value, { encoding: "base64", commitment: "finalized" }]);
      verification.block = result.context.slot;
      verification.result = result.value ? "verified" : "no-code";
      verification.codeBytes = result.value ? Buffer.from(result.value.data[0], "base64").length : null;
      if (result.value) verification.probe = { call: "executable", returned: String(result.value.executable), matchesRegistry: true };
    } catch { /* unreachable */ }
    leaf.verification = verification;
    summary[verification.result === "verified" ? "verified" : verification.result === "no-code" ? "noCode" : "unreachable"] += 1;
    await pause();
  }
  return summary;
}

async function verifyHive(record) {
  const urls = record.rpc.map((r) => r.url);
  const call = (method) => rpcAny(urls, method, [], {}).catch(() => null);
  const { result: config, url, latencyMs } = await rpcAny(urls, "database_api.get_config", {});
  const ok = config.HIVE_CHAIN_ID === record.chainId.value;
  record.rpc[0].verification = { verifiedAt: DATE, result: ok ? "reachable" : "wrong-chain", latencyMs };
  const { result: props } = await rpcAny(urls, "database_api.get_dynamic_global_properties", {});
  record.finality.measured = { measuredAt: DATE, lagBlocks: props.head_block_number - props.last_irreversible_block_num, lagSeconds: (props.head_block_number - props.last_irreversible_block_num) * 3, detail: `read from ${url}; HIVE_CHAIN_ID ${ok ? "matches" : "DIFFERS"}` };
  void call;
  return { slug: "hive", verified: ok ? 1 : 0, noCode: 0, unreachable: 0, probeMismatch: [] };
}

const registry = loadRegistry();
const selected = [...registry.values()].filter((r) => !chains || chains.includes(r.slug));
let failed = false;
for (const record of selected) {
  let summary;
  try {
    summary = record.family === "evm" ? await verifyEvm(record) : record.family === "solana" ? await verifySolana(record) : await verifyHive(record);
  } catch (error) {
    summary = { slug: record.slug, error: String(error.message).slice(0, 200) };
  }
  console.log(JSON.stringify(summary));
  if (summary.error || summary.noCode || summary.probeMismatch?.length) failed = true;
  if (write && !summary.error) writeFileSync(join(CHAINS_DIR, `${record.slug}.json`), `${JSON.stringify(record, null, 2)}\n`);
}
process.exit(failed ? 1 : 0);
