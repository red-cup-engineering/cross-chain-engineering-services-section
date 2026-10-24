# Cross-chain services section

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

`@red-cup-engineering/cross-chain-engineering-services-section` 0.1.0. The ground for Tidepool on more than one chain:
a cited, schematized registry of every chain we may stand on, a multi-fork harness, and a deterministic
deployment path that puts one contract at one address on every EVM chain.

Seated under `computer-blockchain-system-services-section/services/`, beside `ethereum-engineering-services-section`
(single-chain EVM tools), `multi-chain-finality-services-section` (receipt merge), `hive-engineering-services-section`
and `solana-services-section`.

## Why a new section, not an extension of multi-chain-finality

`multi-chain-finality-services-section` is a *judge*: it takes finalized EVM receipts, refuses replays, and merges
sovereign views with the FOUR join. It is EVM-only by construction (its CAIP-2 pattern is `eip155`), pure
evidence-handling, and has no notion of addresses, RPCs, fork environments or deployment. Cross-chain is
*geography plus plumbing*: where things are, which rails connect them, how to rehearse and deploy. Folding that
into the finality judge would couple a small, proof-adjacent service to a fast-changing address book.
So: finality stays the judge; this section is the map, and it *imports* finality for the "is this event final
enough" question. Dependency order holds: data (registry) -> code (verify, plan, fork) -> networking (relayers,
roadmap phase 4) -> systems.

## Layout

| path | what |
| --- | --- |
| `schemas/chain.schema.json` | JSON Schema 2020-12 for one chain. Every leaf is `{value, source, readAt, ...}`; null needs `notFound`. |
| `data/records/chain-records/<slug>.json` | 14 records: base, arbitrum-one, optimism, gnosis, ethereum, polygon-pos, celo, base-sepolia, arbitrum-sepolia, op-sepolia, gnosis-chiado, ethereum-sepolia, hive, solana |
| `src/registry.mjs` | load / validate / query (`get`, `getOrNull`, `chainsWith`, `sharedRails`). `get` refuses a not-found datum. |
| `src/rpc.mjs` | un-batched JSON-RPC with ordered fallback (same contract as treasury-observation-service) |
| `src/deterministic.mjs` | CreateX salt, guard, CREATE2/CREATE3 address planning across chains |
| `scripts/verify-chain-registry.mjs` | serial on-chain verification; stamps `verification` into records (`--write`) |
| `scripts/fork-chains.mjs` | anvil forks of registry chains with the real chain id |
| `scripts/deploy-deterministic.mjs` | `plan` (read-only) and `deploy` (forge script, one chain at a time) |
| `scripts/registry.mjs` | CLI: `list`, `get`, `rails`, `validate` |
| `contracts/` | `ForkRegistry.sol` (reads the registry in Foundry), `CrossChainCanary.sol`, `script/DeployDeterministic.s.sol`, `test/RegistryFork.t.sol` |
| `content/.../2026-10-08-note-on-tidepool-cross-chain-field.md` | the field brief |
| `ROADMAP.md` | phased tasks |

## Use

```sh
node scripts/registry.mjs validate
node scripts/registry.mjs get base cctp.tokenMessengerV2
node scripts/registry.mjs rails base arbitrum-one
node scripts/verify-chain-registry.mjs --write            # v0.1 scope: base, base-sepolia, gnosis, arbitrum-one
node scripts/deploy-deterministic.mjs plan --deployer 0x<you> --chains base,arbitrum-one,gnosis
node scripts/fork-chains.mjs --chains base --print        # one fork; more only on a machine with headroom
cd ../ethereum-engineering-services-section && FOUNDRY_PROFILE=crosschain TIDEPOOL_FORK_CHAINS=base forge test
```

The Foundry profile `crosschain` lives in `ethereum-engineering-services-section/foundry.toml` (that file already owns
the solc/remapping setup); its sources are this section's `contracts/`. `forge --profile` is not a flag in forge 1.7.1;
use `FOUNDRY_PROFILE`.

## Registry rules

- No guessed addresses. A datum looked for and not found is `null` with `notFound`.
- `verification` records what was checked on-chain and when (`eth_getCode`, equivalent to `cast code`, plus a
  restating getter where one exists: `symbol()`, `localDomain()`, `eid()`, `getChainId()`, `VERSION()`).
  A record with no `verification` was read from a first-party source but not yet checked on-chain.
- Sources are first-party where a first party publishes (Circle, Chainlink, LayerZero, EAS, Safe, Uniswap,
  eth-infinitism, pcaversaccio). Hyperlane values come from its public registry repo; public RPC lists are
  operator endpoints plus aggregator endpoints, marked as such, and their reachability is measured.
- Refresh path today: re-read the sources and edit records; `normalize-chain-registry.mjs` fixes checksums.
  Automating the read is ROADMAP phase 1.

## Verification state (2026-10-08)

On-chain verified (code present; getters agree with registry): base, base-sepolia, gnosis, arbitrum-one for
every non-null address in groups usdc, cctp, eas, erc4337, create2, hyperlane, layerzero, ccip, safe, permit2, multicall3 (17 on Base, Base Sepolia, Arbitrum, Gnosis each; Gnosis has no CCTP/EAS entries). Solana: all ten program/mint
ids verified by `getAccountInfo` (finalized). Hive: chain id matches `database_api.get_config`. Everything else
is read-from-source, unverified on-chain. Widen with `--all` on a machine with headroom.

## Broken or duplicated elsewhere (found while surveying)

See the field brief, "Survey of what the house already has".
