// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// Dependency-free cheatcode face (the house carries no forge-std; see harness/fixed-fork-beefy-vault-exit).
interface RegistryVm {
    function envOr(string calldata name, string calldata defaultValue) external returns (string memory value);
    function readFile(string calldata path) external view returns (string memory data);
    function projectRoot() external view returns (string memory path);
    function parseJsonAddress(string calldata json, string calldata key) external pure returns (address);
    function parseJsonUint(string calldata json, string calldata key) external pure returns (uint256);
    function parseJsonString(string calldata json, string calldata key) external pure returns (string memory);
    function createSelectFork(string calldata urlOrAlias) external returns (uint256 forkId);
}

/// @title ForkRegistry
/// @notice Reads data/records/chain-records/<slug>.json (the cross-chain registry) from a Foundry test, so fork tests
/// take every address from one cited source of truth instead of hard-coding it.
///
/// Usage: `forge test --root <ethereum section> --profile crosschain`. Env:
///   TIDEPOOL_REGISTRY_DIR  override the chains directory
///   TIDEPOOL_RPC_<SLUG>    override the RPC for a chain (slug upper-cased, '-' -> '_'), e.g. TIDEPOOL_RPC_BASE
///   TIDEPOOL_FORK_CHAINS   comma list of slugs the fork tests run on (default "base")
abstract contract ForkRegistry {
    RegistryVm internal constant VM = RegistryVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function _dir() internal returns (string memory) {
        return VM.envOr(
            "TIDEPOOL_REGISTRY_DIR",
            string.concat(VM.projectRoot(), "/../cross-chain-services-section/data/records/chain-records")
        );
    }

    function loadChain(string memory slug) internal returns (string memory json) {
        json = VM.readFile(string.concat(_dir(), "/", slug, ".json"));
    }

    /// @dev Address at a registry path such as ".cctp.tokenMessengerV2"; returns address(0) when the registry
    /// holds null (not found). Never invents a value.
    function addr(string memory json, string memory path) internal view returns (address a) {
        try VM.parseJsonAddress(json, string.concat(path, ".value")) returns (address parsed) {
            a = parsed;
        } catch {
            a = address(0);
        }
    }

    function num(string memory json, string memory path) internal view returns (uint256 n) {
        n = VM.parseJsonUint(json, string.concat(path, ".value"));
    }

    function str(string memory json, string memory path) internal view returns (string memory s) {
        s = VM.parseJsonString(json, string.concat(path, ".value"));
    }

    /// @dev Fork the chain using the first RPC in the record (or the env override).
    function forkChain(string memory slug, string memory json) internal returns (uint256 forkId) {
        string memory override_ = VM.envOr(string.concat("TIDEPOOL_RPC_", _envKey(slug)), "");
        string memory rpc = bytes(override_).length != 0 ? override_ : VM.parseJsonString(json, ".rpc[0].url");
        forkId = VM.createSelectFork(rpc);
    }

    function _envKey(string memory slug) private pure returns (string memory) {
        bytes memory b = bytes(slug);
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == "-") b[i] = "_";
            else if (b[i] >= 0x61 && b[i] <= 0x7a) b[i] = bytes1(uint8(b[i]) - 32);
        }
        return string(b);
    }
}
