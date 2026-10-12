---
title: "Note on Tidepool's cross-chain field"
description: >-
  Field brief for making Tidepool cross-chain: what the house already has, how value and state can move between
  EVM chains, Hive and Solana, each rail's trust model and cost, and a v1 recommendation (Base hub, Arbitrum and
  Gnosis spokes, CCTP v2 for USDC, Hyperlane with our own ISM for messages, Hive as attested evidence held in FOUR).
date-created: 2026-10-08
type: note
status: active
authors: [claude-sonnet-5-5]
keywords:
  [tidepool, cross-chain, cctp, hyperlane, layerzero, ccip, erc-7683, across, hive, solana, wormhole, create3,
   four, signchain, hub-and-spoke, registry]
---

## Evidence tiers used in this note

- **Verified** means checked against a live chain or node on 2026-10-08 by a script in
  `cross-chain-services-section` (`eth_getCode`, getters such as `localDomain()`, `getAccountInfo`, `get_config`) or
  rehearsed on an anvil fork.
- **Read** means taken today from a first-party page or repo named in the registry record's `source`.
- **Prior knowledge** means I am stating what I know of a protocol's design and did not re-read it today. It is
  where trust-model and cost claims mostly live. Treat it as a hypothesis to confirm before money moves.

## Survey of what the house already has

Reusable:
- `multi-chain-finality-services-section`: EVM-receipt finality assay, replay refusal, FOUR bitwise knowledge join
  (`both` when a reorg appends negative evidence). The right judge; EVM/eip155 only.
- `ethereum-engineering-services-section`: Foundry (forge 1.7.1), solc 0.8.28, `EnterpriseAccount` (4337),
  `FourMixConsensusProfile` (FOUR as two evidence bits), `FinalizedWitnessJournalReceiver`, EAS deploy script,
  `public-evm-read` (Base-only reader with Multicall3), `fixed-fork` harness (declares its own Vm interface;
  the house carries no forge-std).
- `treasury-observation-service/src/chains.mjs`: good transport doctrine (no batching, ordered fallback, a failure
  is never a number). Adopted in `src/rpc.mjs`.
- `key-management-services-section` (mandates, wallet registry, Hive keystore), `hive-engineering-services-section`
  (many services incl. `verify-hive-signed-message-service`, `hive-ledger`, `hive-blockchain-client-service`),
  `solana-services-section` (finalized read-only balance observation), `smart-contract-audit-services-section`
  (calibrated PoC pipeline; useful before any mainnet deploy).

Broken or duplicated (found by reading, not by running the whole suite):
- `computer-blockchain-system-services-section/README.md` named `ethereum-services-section`; the directory is
  `ethereum-engineering-services-section`. Fixed in this run.
- `ethereum-engineering-services-section/foundry.toml` still remaps `@red-cup-engineering/route-directed-yield-service/`
  and `test/RouteDirectedYield.t.sol` imports a deleted package (known; another agent is restoring it). The
  `crosschain` profile does not depend on either.
- Chain lists are duplicated: treasury `chains.mjs` (8 chains, no sources), `public-evm-read.mjs` (Base constants
  incl. a hard-coded Multicall3), finality `CHAIN` regex (eip155 only). None cite anything. The new registry is
  intended to replace all three (ROADMAP phase 5).
- `hive-services-section` contains only `lib/legacy/waggle`, with no package.json; `settlement-trace-chain-node-cell`
  contains only `legacy/`. Shells, not sections.
- `optimism-services-section` is an OP Stack deployer config template and lock files, not an Optimism client;
  `base-chain-data-gateway` is three paid Base reads. Neither helps cross-chain.
- `solana-services-section` observes native SOL balances only; SPL balances are explicitly unobserved, so it cannot
  yet watch USDC or CCTP.
- No file in the blockchain sections mentioned CCTP, Hyperlane, LayerZero, CCIP, Wormhole or CreateX (searched the
  blockchain section tree, excluding node_modules and `lib`). The multi-chain field was empty.

## The registry (Verified / Read)

14 records: Base, Arbitrum One, OP Mainnet, Gnosis, Ethereum, Polygon PoS, Celo; Base/Arbitrum/OP Sepolia, Gnosis
Chiado, Ethereum Sepolia; Hive; Solana. What the read established:

- **CCTP v2 (Read, Verified on Base/Base Sepolia/Arbitrum):** live on Ethereum, OP, Arbitrum, Base, Polygon PoS,
  Solana (domain 5) and testnets for the first four plus Sepolia. **Not on Gnosis, Celo or Hive.** On mainnets
  TokenMessengerV2 is `0x28b5...cf5d` and MessageTransmitterV2 `0x81D4...4B64` at the same address on every EVM
  chain; domains are 0 Ethereum, 2 OP, 3 Arbitrum, 6 Base, 7 Polygon. `localDomain()` on the Base and Arbitrum
  transmitters returned the registry domain.
- **Fast vs standard (Read):** fast attestation ~8 s on Base/Arbitrum/OP (1 confirmation), ~20 s on Ethereum;
  standard ~15-19 min on Ethereum/Base/Arbitrum/OP (~65 ETH blocks); Solana 32 confirmations ~25 s standard. Fast
  transfers draw on a global allowance (Circle's wording).
- **USDC:** native on Base, Arbitrum, OP, Ethereum, Polygon (`0x3c49...`), Celo (`0xceba...`), Solana. Gnosis: no
  Circle address, so null. A bridged USDC.e on Gnosis exists in practice but I read no first-party address for it
  and have not recorded one (Prior knowledge only).
- **Hyperlane (Read; Verified on Base, Base Sepolia, Arbitrum, Gnosis: mailbox, ISM factories, IGP, validatorAnnounce, merkleTreeHook have code and `localDomain()` equals the registry domain):** Mailbox and ISM
  factories listed on all 12 EVM chains plus Solana. Domain id equals chain id for EVM.
- **LayerZero v2 (Read):** EndpointV2 is `0x1a44...728c` on every mainnet in the set, `0x6EDC...f10f` on testnets;
  EIDs 30184 Base, 30110 Arbitrum, 30145 Gnosis, 30168 Solana. `eid()` getter equals the registry EID, and endpoint, ULN302 libraries and executor have code (Verified on
  Base, Base Sepolia, Arbitrum, Gnosis).
- **CCIP (Read):** routers and 64-bit selectors for all set chains including Gnosis, Celo and Solana (a Solana
  program, `Ccip842g...`). Arbitrum Sepolia is on the testnet list; Celo has no testnet entry in our set.
- **EAS (Read, Verified):** on Base/OP the OP-stack predeploys `0x42...21` and `0x42...20`; separate deployments
  on Ethereum, Arbitrum, Polygon, Celo and testnets. **No Gnosis entry** in the EAS README: null.
- **Safe v1.4.1, 4337 EntryPoint v0.7 and v0.8, Permit2, Multicall3, CreateX, Arachnid:** same address on every
  EVM chain in the set per their sources; Verified present on Base, Base Sepolia, Arbitrum and Gnosis (EntryPoints,
  CreateX, Arachnid). Safe's tables omit Chiado.
- **Finality (Verified):** `finalized` tag works on every chain tested; measured lag: Base ~482 blocks / 964 s,
  Arbitrum ~3854 blocks / 1059 s, Gnosis 45 blocks / 225 s, Base Sepolia ~592 blocks / 1184 s. On OP-stack and
  Arbitrum the finalized tag trails by the L1 finality window, so "finalized" there means L1-final.
- **Hive (Read, Verified):** CAIP-2 `hive:beeab0de000000000000000000000000` (the namespace is a Draft); chain id
  matches `database_api.get_config`; 3 s blocks; irreversibility threshold 75% of 21 witnesses. The node queried
  reported `last_irreversible_block_num` equal to head at that moment. **Hive appears in none of the CCTP,
  Hyperlane, LayerZero or CCIP tables.** Nothing connects Hive to any rail but us.
- **Solana (Verified):** genesis hash matches; all ten CCTP/Hyperlane/LayerZero/CCIP program ids and the USDC mint
  exist on mainnet-beta at finalized commitment.

## How value and state can move

### Value: CCTP v2 (native burn/mint)
Burn USDC on chain A via `TokenMessengerV2.depositForBurn`, Circle's attestation service signs, anyone submits the
message to `MessageTransmitterV2` on chain B, which mints native USDC. No wrapped asset, no liquidity pool.
*Trust:* Circle (the issuer already holds the freeze/blacklist power on the asset, so CCTP adds little new trust
for a USDC-denominated pool) and the attestation service's liveness. *Cost:* source gas + destination gas; fast
transfer carries a fee in basis points set by Circle (Prior knowledge; check the fee endpoint). *Reach:* the
six chains above. `depositForBurnWithHook` (Read, in the interface list) lets a pool contract on B execute logic
on arrival, which is how a spoke deposit can arrive "pre-routed" to the hub.

### Messages: Hyperlane, LayerZero v2, CCIP (Prior knowledge unless noted)
- **Hyperlane.** Permissionless: we can deploy our own application and its **own ISM** (interchain security
  module) using the factories in the registry (`staticMessageIdMultisigIsmFactory`, `staticAggregationIsmFactory`,
  `domainRoutingIsmFactory` are Read and present on every set chain). Trust is whatever our ISM says: e.g. an
  aggregation of a message-id multisig of validators we choose plus a second path (a Hive-attestation module). It
  is the only one of the three where *we* own the verification policy without asking a vendor. *Cost:* relayer gas
  + IGP payment; we can run our own relayer. *Reach:* all 12 EVM chains and Solana.
- **LayerZero v2.** Application configures its own DVN set (verifier networks) and executor; default libraries
  are `sendUln302`/`receiveUln302` (registry). Trust is the chosen DVN quorum; liveness depends on executors
  (we can self-execute). *Reach:* all chains in set incl. Solana and Gnosis/Celo. Contracts are not upgradable
  by us (the endpoint is theirs); they are upgradable by LayerZero Labs in principle, which is a
  governance-trust line item.
- **Chainlink CCIP.** Highest-assurance posture (separate Risk Management Network re-checks commits) and
  a rate-limit-per-lane safety net; *cost* is the highest (fees in LINK/native/GHO) and permissioned by
  lane allowlists. Good for "move treasury value above a threshold", poor for chatty pool state.

### Intents: Across / ERC-7683 (Prior knowledge)
Solvers front the destination asset; settlement repays them after a challenge/proof window. Best user
experience for one-off "get my USDC to chain X now", worst fit for authoritative pool state because the user-facing
fill is not a message from the pool. Use as an optional exit ramp for members, not as the state rail. Registry
fields for `across`/`wormhole` are ROADMAP phase 1.

### Wormhole (Prior knowledge)
Guardian-set (19 validators) attestations (VAAs); broad reach including Solana. A second Solana path next to
CCTP/LayerZero/CCIP/Hyperlane. Not needed for v1.

## How Hive participates

Hive has no contracts, so participation is **evidence in, evidence out**, not execution.

1. **In (Hive -> EVM).** A member signs a `custom_json` operation whose payload carries a content-addressed
   SignCell (an `ni:` URI plus the signed body) or a `transfer` of HBD to a pool account. The operation is final
   after irreversibility (Read: 75% of 21 witnesses, 3 s blocks).
2. **Attest.** Hive witnesses do not talk to EVM. Our own relayers (at least three, operated by different
   parties) watch irreversible blocks, and each posts to an EVM `AttestationReceiver` a record
   `(hiveBlockId, trxId, payloadDigest)` signed by the relayer. Optionally a witness we know co-signs
   (their signature is Hive-side evidence of intent; the EVM contract still treats it as one more attestation).
3. **State.** The receiver stores, per Hive fact, each relayer's charge as two evidence bits. This is exactly the
   house's FOUR (`FourMixConsensusProfile.Charge{positiveEvidence, negativeEvidence}`): all agree -> positive;
   relayer A says "occurred" and relayer B says "reorged/not found" -> **both (the top element)**, held as a
   first-class state, never thrown as an error and never silently resolved. The SignChain bilattice gives the
   join (knowledge order) and the meet (truth order): *knowledge join* accumulates evidence, which is what
   `multi-chain-finality-services-section` already does for EVM receipts; a pool decision that needs the truth
   value uses the truth-order meet and treats `both` as "not yet spendable". Disagreement is therefore an
   observable, auditable object that governance (or a bonded relayer dispute) resolves by adding evidence.
4. **Out (EVM -> Hive).** A hub event is relayed back as a Hive `custom_json` by a relayer account; the Hive
   side treats it as evidence the same way.
5. **Value.** HBD cannot be burned/minted by any rail here. Moving value between HBD and USDC is an exchange
   (internal market, Hive Engine, or a conversion), not a bridge; keep it a priced, witnessed trade and keep
   Hive tally credit in HBD as the pool service does today.

*Trust:* the relayer set (n-of-m with FOUR semantic, not a voting committee that returns an error) and the Hive
witness set for finality. *Cost:* negligible Hive RC; EVM gas for attestations on a cheap L2.

## How Solana participates

CCTP v2 covers USDC (Read; program ids Verified); Hyperlane, LayerZero and CCIP all run on Solana (Read; ids
Verified); Wormhole does too (Prior knowledge). Solana is therefore a **spoke** for USDC deposits and withdrawals
with CCTP as the value path and Hyperlane (our ISM) as the message path. The house `solana-services-section`
must grow SPL reads (ROADMAP) before it can witness deposits. Solana's execution model (accounts, PDAs) means the
spoke program is separate Rust/Anchor work, not a port of the Solidity spoke.

## Trust and cost summary

| rail | moves | who must be trusted | marginal cost | chains in our set |
| --- | --- | --- | --- | --- |
| CCTP v2 | native USDC | Circle (already the asset issuer) | gas + fast fee | 5 EVM mainnets + Solana |
| Hyperlane | messages | our own ISM (validators we pick) | relayer gas + IGP | all 7 EVM mainnets + Solana |
| LayerZero v2 | messages | our DVN set + LayerZero endpoint | DVN + executor fee | all + Solana |
| CCIP | messages, tokens | Chainlink DONs + RMN | highest | all + Solana |
| Across/7683 | assets via solvers | solver liveness, settlement layer | solver spread | major L2s |
| Hive attestation | Hive facts as evidence | our relayers (+ witness finality) | cheap | Hive only |

## Recommendation for Tidepool v1

1. **Chains first:** Base as hub; Arbitrum One and Gnosis as spokes; Base Sepolia, Arbitrum Sepolia, Chiado for
   rehearsal. Base and Arbitrum are CCTP chains with fast attestation; Gnosis is the one the founder's
   community already touches, but it has no CCTP, so Gnosis deposits ride a message rail and its USDC (bridged) is
   a separate asset line, not fungible with native USDC. Hive is evidence, not a chain, in v1; Solana is v1.5.
2. **Value rail:** CCTP v2 between Base and Arbitrum (and later OP/Polygon/Solana); no wrapped USDC anywhere.
3. **Message rail:** Hyperlane with our own aggregation ISM (message-id multisig + a second independent path),
   because we own the verification policy and it reaches Gnosis and Solana. LayerZero as a reserve rail for
   redundancy, CCIP only for large treasury moves.
4. **State coherence: hub-and-spoke, not mesh.** One authoritative pool ledger on Base. Spokes hold only
   deposits-in-transit and a mirrored read of hub state; every state change is a hub transaction caused by a
   message from a spoke. A mesh of N chains needs N(N-1) channels, N-way reconciliation, and no single place to
   point at when someone asks "what is the pool's state" - which is the property a *witnessed record* (the
   house's product) cannot do without. Spoke-originated messages are idempotent and carry a content-addressed
   id so replay is a no-op (the finality section already refuses replays). Hive attestations land at the hub
   only.
5. **Same address everywhere:** deploy hub and spokes with CreateX CREATE3 from one deployer key and one salt label
   so the world model addresses `0xA90C...` (the canary) style constants on every chain (Verified on Base and
   Arbitrum forks; `plan` shows one address across Base, Arbitrum, Gnosis, Base Sepolia).

## What was not done or not checked

- On-chain verification covered Base, Base Sepolia, Arbitrum One and Gnosis for usdc/cctp/eas/erc4337/create2, plus
  Solana programs and Hive's chain id, because the machine was overloaded. The other chains' addresses are Read
  only. `node scripts/verify-chain-registry.mjs --all --write` closes this.
- Verified on those four chains in a second pass: hyperlane, layerzero, ccip, safe, permit2, multicall3 (17 addresses
  each, zero without code, all getter probes matching). Not run elsewhere.
- Costs are order-of-magnitude statements from Prior knowledge; none was measured.
- No bridge or messaging transaction was sent on any real chain. The CreateX deployment was rehearsed only on
  anvil forks of Base and Arbitrum.
