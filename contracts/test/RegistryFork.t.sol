// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ForkRegistry} from "../ForkRegistry.sol";

interface ILocalDomain {
    function localDomain() external view returns (uint32);
}

interface IErc20Symbol {
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
}

interface IMulticallChainId {
    function getChainId() external view returns (uint256);
}

/// Fork test: for each chain in TIDEPOOL_FORK_CHAINS (default "base"), fork it and check that the registry's
/// canonical contracts exist and agree with what they say about themselves.
/// One fork at a time; the test never runs more than the chains you name.
contract RegistryForkTest is ForkRegistry {
    function _chains() internal returns (string[] memory out) {
        string memory csv = VM.envOr("TIDEPOOL_FORK_CHAINS", "base");
        bytes memory b = bytes(csv);
        uint256 count = 1;
        for (uint256 i = 0; i < b.length; i++) if (b[i] == ",") count++;
        out = new string[](count);
        uint256 start;
        uint256 k;
        for (uint256 i = 0; i <= b.length; i++) {
            if (i == b.length || b[i] == ",") {
                bytes memory part = new bytes(i - start);
                for (uint256 j = 0; j < part.length; j++) part[j] = b[start + j];
                out[k++] = string(part);
                start = i + 1;
            }
        }
    }

    function _hasCode(address a) internal view returns (bool) {
        return a.code.length > 0;
    }

    function testRegistryContractsExistAndAgree() public {
        string[] memory slugs = _chains();
        for (uint256 i = 0; i < slugs.length; i++) {
            string memory json = loadChain(slugs[i]);
            forkChain(slugs[i], json);
            require(block.chainid == num(json, ".chainId"), "chain id mismatch");

            address create2 = addr(json, ".create2.createX");
            address entry7 = addr(json, ".erc4337.entryPointV07");
            address entry8 = addr(json, ".erc4337.entryPointV08");
            require(_hasCode(create2), "CreateX missing");
            require(_hasCode(entry7), "EntryPoint v0.7 missing");
            require(_hasCode(entry8), "EntryPoint v0.8 missing");

            address usdc = addr(json, ".usdc.address");
            if (usdc != address(0)) {
                require(IErc20Symbol(usdc).decimals() == 6, "USDC decimals");
                require(keccak256(bytes(IErc20Symbol(usdc).symbol())) == keccak256("USDC"), "USDC symbol");
            }

            address transmitter = addr(json, ".cctp.messageTransmitterV2");
            if (transmitter != address(0)) {
                require(ILocalDomain(transmitter).localDomain() == num(json, ".cctp.domain"), "CCTP domain");
            }

            address mailbox = addr(json, ".hyperlane.mailbox");
            if (mailbox != address(0)) {
                require(ILocalDomain(mailbox).localDomain() == num(json, ".hyperlane.domainId"), "Hyperlane domain");
            }

            address mc3 = addr(json, ".multicall3");
            if (mc3 != address(0)) require(IMulticallChainId(mc3).getChainId() == block.chainid, "Multicall3");
        }
    }
}
