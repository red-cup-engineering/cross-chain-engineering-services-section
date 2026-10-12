/**
 * Deterministic cross-chain addressing through CreateX (and the Arachnid CREATE2 proxy).
 *
 * The CreateX permissioned salt is deployer(20 bytes) ++ 0x00 ++ label(11 bytes). Byte 20 = 0x00 means the salt is
 * NOT mixed with the chain id, so the same salt yields the same address on every chain. CreateX then guards it:
 * guardedSalt = keccak256(abi.encode(deployer, salt)). CREATE3 address = f(createX, guardedSalt) only;
 * CREATE2 address additionally depends on keccak256(initCode).
 *
 * The CREATE3 address is read from CreateX itself (computeCreate3Address) rather than re-derived here, so the
 * registry never carries a second copy of CreateX's proxy-bytecode constant.
 */
import { keccak256 } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/keccak256";
import { toChecksumAddress } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/evm";
import { ethCall, rpcAny } from "./rpc.mjs";
import { get, rpcUrls } from "./registry.mjs";

const hex = (b) => `0x${Buffer.from(b).toString("hex")}`;
const bytes = (h) => Buffer.from(h.replace(/^0x/, ""), "hex");
const pad32 = (b) => Buffer.concat([Buffer.alloc(32 - b.length), b]);
const selector = (sig) => keccak256(Buffer.from(sig)).subarray(0, 4);

/** bytes32 label (11 bytes used) from a human string. */
export const labelOf = (text) => hex(keccak256(Buffer.from(text)));

export function permissionedSalt(deployer, label) {
  return hex(Buffer.concat([bytes(deployer), Buffer.from([0]), bytes(label).subarray(0, 11)]));
}

export function guardedSalt(deployer, salt) {
  return hex(keccak256(Buffer.concat([pad32(bytes(deployer)), bytes(salt)])));
}

/** CREATE2 address of initCodeHash under factory with a (guarded) salt. */
export function create2Address(factory, salt, initCodeHash) {
  const digest = keccak256(Buffer.concat([Buffer.from([0xff]), bytes(factory), bytes(salt), bytes(initCodeHash)]));
  return toChecksumAddress(hex(digest.subarray(12)));
}

/** Ask CreateX on this chain where a CREATE3 deployment with this guarded salt will land. */
export async function create3AddressOn(record, guarded) {
  const createX = get(record, "create2.createX");
  const data = hex(Buffer.concat([selector("computeCreate3Address(bytes32,address)"), bytes(guarded), pad32(bytes(createX))]));
  const { result } = await ethCall(rpcUrls(record), createX, data);
  return toChecksumAddress(`0x${result.slice(-40)}`);
}

export async function codeSizeOn(record, address) {
  const { result } = await rpcAny(rpcUrls(record), "eth_getCode", [address, "latest"]);
  return (result.length - 2) / 2;
}

/**
 * Plan one deployment across chains. Returns per-chain { slug, address, deployed } and whether all addresses agree.
 * mode "create3": address independent of init code. mode "create2": requires initCode (hex) and hashes it.
 */
export async function planDeployment(records, { deployer, label, mode = "create3", initCode }) {
  const salt = permissionedSalt(deployer, label);
  const guarded = guardedSalt(deployer, salt);
  const rows = [];
  for (const record of records) {
    const address = mode === "create2"
      ? create2Address(get(record, "create2.createX"), guarded, hex(keccak256(bytes(initCode))))
      : await create3AddressOn(record, guarded);
    rows.push({ slug: record.slug, address, deployed: (await codeSizeOn(record, address)) > 0 });
  }
  return { salt, guardedSalt: guarded, mode, rows, uniform: new Set(rows.map((r) => r.address)).size === 1 };
}
