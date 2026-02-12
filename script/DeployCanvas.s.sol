// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {Canvas} from "../src/Canvas.sol";

contract DeployCanvas is Script {
    // LEMON token on Base
    address constant LEMON = 0xd2969cc475A49e73182Ae1c517AdD57dB0F1c2AC;

    function run() public {
        vm.startBroadcast();
        Canvas canvas = new Canvas(LEMON);
        vm.stopBroadcast();

        console.log("Canvas deployed at:", address(canvas));
        console.log("Token:", address(canvas.token()));
        console.log("Burn amount:", canvas.burnAmount());
    }
}
