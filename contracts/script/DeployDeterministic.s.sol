// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CrossChainCanary} from "../CrossChainCanary.sol";

interface DeployVm {
    function envBytes32(string calldata name) external returns (bytes32 value);
    function envOr(string calldata name, string calldata defaultValue) external returns (string memory value);
    function startBroadcast() external;
    function stopBroadcast() external;
}

interface ICreateX {
    function deployCreate3(bytes32 salt, bytes memory initCode) external payable returns (address newContract);
    function deployCreate2(bytes32 salt, bytes memory initCode) external payable returns (address newContract);
    function computeCreate3Address(bytes32 salt, address deployer) external view returns (address);
    function computeCreate2Address(bytes32 salt, bytes32 initCodeHash, address deployer) external view returns (address);
}

/// @title DeployDeterministic
/// @notice Deploys CrossChainCanary through CreateX so the same salt gives the same address on every EVM chain.
///
/// Env: SALT_LABEL (bytes32, e.g. keccak256 of a label; only its first 11 bytes are used), WORLD (bytes32),
///      MODE ("create3" default | "create2"), BROADCASTER (the deployer address; must equal the broadcasting key).
/// CreateX permissioned salt: bytes[0:20] = deployer, byte[20] = 0x00 (no chain-id mixing => same address on all
/// chains), bytes[21:32] = label. CreateX then hashes it with the deployer before use, so nobody else can take
/// the address. CREATE3 makes the address independent of the init code; CREATE2 makes it depend on it.
contract DeployDeterministic {
    DeployVm internal constant VM = DeployVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address internal constant CREATEX = 0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed;

    event Deployed(address indexed deployed, bytes32 salt, string mode);

    function permissionedSalt(address deployer, bytes32 label) public pure returns (bytes32) {
        return bytes32(abi.encodePacked(deployer, bytes1(0x00), bytes11(label)));
    }

    function guard(address deployer, bytes32 salt) public pure returns (bytes32) {
        return keccak256(abi.encode(deployer, salt));
    }

    function run() external returns (address deployed) {
        address deployer = address(uint160(uint256(VM.envBytes32("BROADCASTER"))));
        bytes32 salt = permissionedSalt(deployer, VM.envBytes32("SALT_LABEL"));
        bytes memory initCode = abi.encodePacked(type(CrossChainCanary).creationCode, abi.encode(VM.envBytes32("WORLD")));
        bool create2 = keccak256(bytes(VM.envOr("MODE", "create3"))) == keccak256("create2");

        address expected = create2
            ? ICreateX(CREATEX).computeCreate2Address(guard(deployer, salt), keccak256(initCode), CREATEX)
            : ICreateX(CREATEX).computeCreate3Address(guard(deployer, salt), CREATEX);

        if (expected.code.length == 0) {
            VM.startBroadcast();
            deployed = create2 ? ICreateX(CREATEX).deployCreate2(salt, initCode) : ICreateX(CREATEX).deployCreate3(salt, initCode);
            VM.stopBroadcast();
            require(deployed == expected, "address drift");
        } else {
            deployed = expected; // already there: idempotent re-run
        }
        emit Deployed(deployed, salt, create2 ? "create2" : "create3");
    }
}
