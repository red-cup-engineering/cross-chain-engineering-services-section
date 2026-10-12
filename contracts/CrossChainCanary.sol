// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title CrossChainCanary
/// @notice Smallest possible probe contract for the deterministic-deployment path. Deploy it with the
/// same salt on every chain; if it lands at one address everywhere, the world-model addressing works.
/// It holds no value and no authority.
contract CrossChainCanary {
    /// @notice Identifier of the world model this deployment belongs to (e.g. keccak256("tidepool.v0")).
    bytes32 public immutable world;

    constructor(bytes32 world_) {
        world = world_;
    }

    /// @notice The chain this copy is running on, so a cross-chain observer can tell copies apart.
    function chainId() external view returns (uint256) {
        return block.chainid;
    }
}
