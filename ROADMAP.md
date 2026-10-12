# Cross-chain roadmap

Sized for Sonnet engineers: each task names its files and an acceptance check you can run. Dependency order:
data -> code -> networking -> systems. Tasks inside a phase are independent unless marked.
Do not run more than one anvil fork or forge build at a time on the shared laptop.

## Phase 0 - done in this run (0.1.0)
Registry schema + 14 records; serial verifier; registry/rpc/deterministic libs; fork launcher; CreateX deployment
script (rehearsed on Base and Arbitrum forks: same address `0xA90Cf2A56817A6CE8A043d881888f9afD3ce12b4`);
`crosschain` Foundry profile; Base fork test passing; field brief.

## Phase 1 - registry hardening (data/code)
1. **Port the source readers to Node.** Files: `scripts/refresh-chain-registry.mjs`, `test/refresh.test.mjs`.
   Fetch and parse Circle contract-addresses / USDC / domains pages, Hyperlane registry yaml, LayerZero deployments
   JSON, Chainlink CCIP directory (split per chain block; do not use a lazy regex across chains), EAS README, Safe
   deployments JSON, Multicall3 deployments. Re-emit records preserving `verification` when the value is unchanged,
   dropping it when changed. Accept: running it twice yields byte-identical records; changing one fixture address
   clears only that leaf's `verification`.
2. **Verify the whole registry.** Run `verify-chain-registry.mjs --all --write` on a quiet machine. Accept: every
   non-null EVM address has `verification.result` of `verified`; any `no-code` is either corrected from its source
   or set null with `notFound`. Commit the diff.
3. **Domain/ID cross-checks.** Extend `PROBES` in `verify-chain-registry.mjs`: CCIP router `typeAndVersion()`,
   TokenMessengerV2 `localMessageTransmitter()`, EAS `version()`. Accept: new probes pass on base, gnosis.
4. **Staleness gate.** `scripts/registry.mjs stale --days 30` lists leaves whose `readAt` is older. Accept: unit test
   with a fixture record.
5. **Wormhole and Across fields.** Add `wormhole` (core bridge, chain id) and `across` (SpokePool, ERC-7683 settler)
   to the schema and records, each cited and verified. Accept: schema validates; `chainsWith(registry, "across.spokePool")`.
6. **Hive operation catalogue.** Schema section `operations` for Hive: custom_json ids the house uses (grep
   hive-fleet-operations-service scripts), with size limit read from a first-party source. Accept: record validates.

## Phase 2 - harness (code)
1. **Multi-chain fork test.** Extend `RegistryFork.t.sol` loop to assert CCTP `tokenMessenger` -> `localMessageTransmitter`
   pairing and EAS `getSchemaRegistry()`. Accept: `TIDEPOOL_FORK_CHAINS=base` then `=gnosis` each pass (run separately).
2. **Pinned-block forks.** `fork-chains.mjs --block` already exists; add `data/state/fork-blocks.json` written by the
   verifier so CI can reproduce. Accept: re-run test with pinned blocks is deterministic.
3. **Generalise the deployer.** `DeployDeterministic.s.sol` deploys the canary only. Read init code from
   `INIT_CODE_PATH` (forge artifact JSON via `vm.readFile` + `parseJsonBytes`) so any contract can be deployed.
   Accept: deploying `EnterpriseAccount`'s factory on two forks yields one address.
4. **Rehearsal driver.** `scripts/rehearse-deploy.mjs` (promote the scratch rehearsal: start one fork, deploy, check
   code, kill, next chain). Accept: prints one address for base then arbitrum-one then gnosis; exits 1 on drift.
5. **CCTP burn/mint rehearsal.** On a Base fork, impersonate a USDC holder, `depositForBurn` to domain 3; assert the
   `MessageSent` event body. Accept: test asserts domain, mint recipient, `minFinalityThreshold`.

## Phase 3 - Tidepool v1 contracts (code/systems; needs the pool contract owner)
1. **Deployment of the Tidepool pool contracts** (amended 2026-10-08 to match the protocol specification revision 3,
   `public-blockchain-yield-pool-finance-services-section/.../2026-10-08-specification-of-the-tidepool-protocol.md` §A7/A.10):
   there is no `TidepoolHub`/`TidepoolSpoke` pair. Every site runs a full local pool (`tidepool-evm`'s
   `script/DeployPool.s.sol`, CreateX CREATE3 with a permissioned salt and predicted addresses); "hub" means the
   head-merge point (`SiteWitnessV1` on Base holds the merged read); value does not move between sites in v0.1, and
   CCTP forwarding (Base-Arbitrum only) is a v0.3 treasury operation (`TP-EVM-036`). This section's task is to make
   the generalized deployer (2.3) and rehearsal driver (2.4) accept `tidepool-evm`'s artifacts and to cross-check its
   `scripts/predict-addresses.mjs` against `src/deterministic.mjs`. Accept: identical predicted addresses from both
   scripts for the v0.1 contract set on Base Sepolia and Chiado forks.
2. **Message adapter interface** `IPoolMessenger` with Hyperlane, LayerZero, CCIP implementations, selected per
   route. Accept: one mock per rail passes the same conformance test.
3. **Own ISM.** Deploy a Hyperlane `StaticAggregationIsm` (threshold 2) of our message-id multisig and a
   Hive-attestation ISM stub using the registry's `staticAggregationIsmFactory`. Accept: fork test delivers a
   message only with both.

## Phase 4 - networking: Hive and Solana as participants
1. **Hive relayer** `src/hive-attester.mjs`: watch custom_json of a Tidepool id, wait for irreversibility, emit an
   attestation (block id, trx id, payload SHA-256 as `ni:` URI). Accept: test against recorded Hive blocks.
2. **EVM attestation receiver** (extends `FinalizedWitnessJournalReceiver`'s pattern): accepts attestations from
   N relayers, stores each relayer's charge as the two FOUR bits; disagreement is stored, not rejected. Accept: two
   relayers disagree -> state is `both`; a third agreeing does not clear it.
3. **Solana CCTP leg.** Document and test the Solana domain-5 route using the registry's program ids on devnet.
4. **Finality bridge.** Wire `multi-chain-finality-services-section` to read `finality.measured` and
   `cctp.finality` from the registry so policies are data, not constants.

## Phase 5 - operations
1. Registry refresh as a scheduled MAPE-K loop with the staleness gate.
2. Treasury-observation-service: replace its private `chains.mjs` registry with this one (it carries 8 chains,
   no CAIP-2 source, and drifts). Accept: its tests pass against registry data; one chain list in the house.
3. Fix `computer-blockchain-system-services-section/README.md` holdings (names a non-existent
   `ethereum-services-section`).
