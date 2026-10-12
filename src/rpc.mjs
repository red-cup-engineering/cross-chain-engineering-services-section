/**
 * Minimal JSON-RPC transport for the cross-chain registry tools.
 *
 * Same contract as the treasury-observation-service chain transport: an
 * unreachable endpoint never yields a value. Every call returns an answer or
 * throws with every attempt recorded; no call defaults to zero or empty.
 * Requests are single (never batched), because public endpoints silently
 * reject batch form.
 */

export class RpcFailure extends Error {
  constructor(method, attempts) {
    super(`${method} failed on every endpoint: ${attempts.map((a) => `${a.url} (${a.reason})`).join("; ")}`);
    this.name = "RpcFailure";
    this.attempts = attempts;
  }
}

/** One JSON-RPC call against one URL. Throws on transport or RPC error. */
export async function rpcOnce(url, method, params = [], { timeoutMs = 15000, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(`${body.error.code ?? ""} ${body.error.message ?? "rpc error"}`.trim());
  return body.result;
}

/** Try urls in order; return { result, url, latencyMs }. */
export async function rpcAny(urls, method, params = [], options = {}) {
  const attempts = [];
  for (const url of urls) {
    const started = Date.now();
    try {
      const result = await rpcOnce(url, method, params, options);
      return { result, url, latencyMs: Date.now() - started };
    } catch (error) {
      attempts.push({ url, reason: String(error.message ?? error).slice(0, 120) });
    }
  }
  throw new RpcFailure(method, attempts);
}

export const ethCall = (urls, to, data, block = "latest", options) => rpcAny(urls, "eth_call", [{ to, data }, block], options);

/** Decode an ABI-encoded single `string` return. */
export function decodeAbiString(hex) {
  const bytes = Buffer.from(hex.replace(/^0x/, ""), "hex");
  if (bytes.length < 64) throw new Error("not an ABI string");
  const offset = Number(BigInt("0x" + bytes.subarray(0, 32).toString("hex")));
  const length = Number(BigInt("0x" + bytes.subarray(offset, offset + 32).toString("hex")));
  return bytes.subarray(offset + 32, offset + 32 + length).toString("utf8");
}

/** Decode an ABI-encoded single uint256 as a BigInt. */
export const decodeAbiUint = (hex) => BigInt(hex);
