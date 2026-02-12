// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract Canvas {
    IERC20 public immutable token;
    uint256 public immutable burnAmount;
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    uint16 public constant WIDTH = 1000;
    uint16 public constant HEIGHT = 1000;

    event PixelPlaced(address indexed user, uint16 x, uint16 y, uint24 color);

    constructor(address _token) {
        token = IERC20(_token);
        burnAmount = 1_000 * 1e18;
    }

    function placePixel(uint16 x, uint16 y, uint24 color) external {
        require(x < WIDTH, "x out of bounds");
        require(y < HEIGHT, "y out of bounds");
        require(token.transferFrom(msg.sender, DEAD, burnAmount), "burn failed");
        emit PixelPlaced(msg.sender, x, y, color);
    }

    function placePixels(uint16[] calldata xs, uint16[] calldata ys, uint24[] calldata colors) external {
        uint256 len = xs.length;
        require(len > 0, "empty");
        require(len == ys.length && len == colors.length, "length mismatch");
        require(token.transferFrom(msg.sender, DEAD, burnAmount * len), "burn failed");
        for (uint256 i = 0; i < len; i++) {
            require(xs[i] < WIDTH, "x out of bounds");
            require(ys[i] < HEIGHT, "y out of bounds");
            emit PixelPlaced(msg.sender, xs[i], ys[i], colors[i]);
        }
    }
}
