import test from "node:test";
import assert from "node:assert/strict";
import { labelOf, permissionedSalt, guardedSalt, create2Address } from "../src/deterministic.mjs";

const deployer = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

test("permissioned salt is deployer ++ 0x00 ++ 11 label bytes", () => {
  const salt = permissionedSalt(deployer, labelOf("tidepool.canary.v1"));
  assert.equal(salt.length, 2 + 64);
  assert.equal(salt.slice(2, 42), deployer.slice(2).toLowerCase());
  assert.equal(salt.slice(42, 44), "00", "byte 20 = 0x00 means no chain-id mixing");
});

test("guarded salt is deterministic and depends on the deployer", () => {
  const salt = permissionedSalt(deployer, labelOf("x"));
  assert.equal(guardedSalt(deployer, salt), guardedSalt(deployer, salt));
  assert.notEqual(guardedSalt(deployer, salt), guardedSalt("0x70997970C51812dc3A010C7d01b50e0d17dc79C8", salt));
});

test("create2Address matches the EIP-1014 example 0", () => {
  const address = create2Address("0x0000000000000000000000000000000000000000", `0x${"00".repeat(32)}`, "0xbc36789e7a1e281436464229828f817d6612f7b477d66591ff96a9e064bcc98a");
  assert.equal(address, "0x4D1A2e2bB4F88F0250f26Ffff098B0b30B26BF38");
});
