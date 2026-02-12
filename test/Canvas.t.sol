// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Canvas.sol";

contract MockERC20 {
    string public name = "VV";
    string public symbol = "VV";
    uint8 public decimals = 18;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (allowance[from][msg.sender] < amount) return false;
        if (balanceOf[from] < amount) return false;
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract CanvasTest is Test {
    event PixelPlaced(address indexed user, uint16 x, uint16 y, uint24 color);

    Canvas public canvas;
    MockERC20 public token;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    uint256 ONE_TOKEN;
    uint256 BURN_PER_PIXEL;

    function setUp() public {
        token = new MockERC20();
        canvas = new Canvas(address(token));
        ONE_TOKEN = 1e18;
        BURN_PER_PIXEL = 1000 * ONE_TOKEN;

        // Fund alice with 1,000,000 tokens and approve
        token.mint(alice, 1_000_000 * ONE_TOKEN);
        vm.prank(alice);
        token.approve(address(canvas), type(uint256).max);

        // Fund bob with 5,000 tokens and approve (enough for 5 pixels)
        token.mint(bob, 5_000 * ONE_TOKEN);
        vm.prank(bob);
        token.approve(address(canvas), type(uint256).max);
    }

    // --- Constructor ---

    function test_constructor_setsToken() public view {
        assertEq(address(canvas.token()), address(token));
    }

    function test_constructor_setsBurnAmount() public view {
        assertEq(canvas.burnAmount(), BURN_PER_PIXEL);
    }

    function test_constants() public view {
        assertEq(canvas.WIDTH(), 1000);
        assertEq(canvas.HEIGHT(), 1000);
    }

    // --- placePixel ---

    function test_placePixel_success() public {
        vm.prank(alice);
        canvas.placePixel(0, 0, 0xFF0000);

        // Token burned to dead address
        assertEq(token.balanceOf(DEAD), BURN_PER_PIXEL);
        assertEq(token.balanceOf(alice), 999_000 * ONE_TOKEN);
    }

    function test_placePixel_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit PixelPlaced(alice, 500, 500, 0x00FF00);

        vm.prank(alice);
        canvas.placePixel(500, 500, 0x00FF00);
    }

    function test_placePixel_maxCoords() public {
        vm.prank(alice);
        canvas.placePixel(999, 999, 0xFFFFFF);
        assertEq(token.balanceOf(DEAD), BURN_PER_PIXEL);
    }

    function test_placePixel_revertsXOutOfBounds() public {
        vm.prank(alice);
        vm.expectRevert("x out of bounds");
        canvas.placePixel(1000, 0, 0x000000);
    }

    function test_placePixel_revertsYOutOfBounds() public {
        vm.prank(alice);
        vm.expectRevert("y out of bounds");
        canvas.placePixel(0, 1000, 0x000000);
    }

    function test_placePixel_revertsBothOutOfBounds() public {
        vm.prank(alice);
        vm.expectRevert("x out of bounds");
        canvas.placePixel(1000, 1000, 0x000000);
    }

    function test_placePixel_revertsNoAllowance() public {
        address noApproval = makeAddr("noApproval");
        token.mint(noApproval, 10_000 * ONE_TOKEN);
        // No approve call

        vm.prank(noApproval);
        vm.expectRevert("burn failed");
        canvas.placePixel(0, 0, 0x000000);
    }

    function test_placePixel_revertsInsufficientBalance() public {
        address broke = makeAddr("broke");
        // No tokens minted
        vm.prank(broke);
        token.approve(address(canvas), type(uint256).max);

        vm.prank(broke);
        vm.expectRevert("burn failed");
        canvas.placePixel(0, 0, 0x000000);
    }

    function test_placePixel_multiplePlacements() public {
        vm.startPrank(alice);
        canvas.placePixel(0, 0, 0xFF0000);
        canvas.placePixel(1, 1, 0x00FF00);
        canvas.placePixel(2, 2, 0x0000FF);
        vm.stopPrank();

        assertEq(token.balanceOf(DEAD), 3 * BURN_PER_PIXEL);
        assertEq(token.balanceOf(alice), 997_000 * ONE_TOKEN);
    }

    function test_placePixel_sameCoordOverwrite() public {
        // Two users can place on the same pixel (last write wins on-chain events)
        vm.prank(alice);
        canvas.placePixel(100, 100, 0xFF0000);

        vm.prank(bob);
        canvas.placePixel(100, 100, 0x0000FF);

        assertEq(token.balanceOf(DEAD), 2 * BURN_PER_PIXEL);
    }

    function test_placePixel_zeroColor() public {
        vm.prank(alice);
        canvas.placePixel(0, 0, 0x000000);
        assertEq(token.balanceOf(DEAD), BURN_PER_PIXEL);
    }

    function test_placePixel_maxColor() public {
        vm.expectEmit(true, false, false, true);
        emit PixelPlaced(alice, 0, 0, 0xFFFFFF);

        vm.prank(alice);
        canvas.placePixel(0, 0, 0xFFFFFF);
    }

    // --- placePixels (batch) ---

    function test_placePixels_success() public {
        uint16[] memory xs = new uint16[](3);
        uint16[] memory ys = new uint16[](3);
        uint24[] memory colors = new uint24[](3);

        xs[0] = 0; ys[0] = 0; colors[0] = 0xFF0000;
        xs[1] = 1; ys[1] = 1; colors[1] = 0x00FF00;
        xs[2] = 2; ys[2] = 2; colors[2] = 0x0000FF;

        vm.prank(alice);
        canvas.placePixels(xs, ys, colors);

        assertEq(token.balanceOf(DEAD), 3 * BURN_PER_PIXEL);
        assertEq(token.balanceOf(alice), 997_000 * ONE_TOKEN);
    }

    function test_placePixels_emitsEvents() public {
        uint16[] memory xs = new uint16[](2);
        uint16[] memory ys = new uint16[](2);
        uint24[] memory colors = new uint24[](2);

        xs[0] = 10; ys[0] = 20; colors[0] = 0xABCDEF;
        xs[1] = 30; ys[1] = 40; colors[1] = 0x123456;

        vm.expectEmit(true, false, false, true);
        emit PixelPlaced(alice, 10, 20, 0xABCDEF);
        vm.expectEmit(true, false, false, true);
        emit PixelPlaced(alice, 30, 40, 0x123456);

        vm.prank(alice);
        canvas.placePixels(xs, ys, colors);
    }

    function test_placePixels_revertsLengthMismatch() public {
        uint16[] memory xs = new uint16[](2);
        uint16[] memory ys = new uint16[](3);
        uint24[] memory colors = new uint24[](2);

        vm.prank(alice);
        vm.expectRevert("length mismatch");
        canvas.placePixels(xs, ys, colors);
    }

    function test_placePixels_revertsColorLengthMismatch() public {
        uint16[] memory xs = new uint16[](2);
        uint16[] memory ys = new uint16[](2);
        uint24[] memory colors = new uint24[](1);

        vm.prank(alice);
        vm.expectRevert("length mismatch");
        canvas.placePixels(xs, ys, colors);
    }

    function test_placePixels_revertsOutOfBounds() public {
        uint16[] memory xs = new uint16[](2);
        uint16[] memory ys = new uint16[](2);
        uint24[] memory colors = new uint24[](2);

        xs[0] = 0; ys[0] = 0; colors[0] = 0x000000;
        xs[1] = 1000; ys[1] = 0; colors[1] = 0x000000; // out of bounds

        vm.prank(alice);
        vm.expectRevert("x out of bounds");
        canvas.placePixels(xs, ys, colors);
    }

    function test_placePixels_revertsInsufficientBalance() public {
        // Bob has 5,000 tokens (enough for 5 pixels), try to place 6
        uint16[] memory xs = new uint16[](6);
        uint16[] memory ys = new uint16[](6);
        uint24[] memory colors = new uint24[](6);

        for (uint16 i = 0; i < 6; i++) {
            xs[i] = i; ys[i] = 0; colors[i] = 0x000000;
        }

        vm.prank(bob);
        vm.expectRevert("burn failed");
        canvas.placePixels(xs, ys, colors);
    }

    function test_placePixels_revertsEmptyArrays() public {
        uint16[] memory xs = new uint16[](0);
        uint16[] memory ys = new uint16[](0);
        uint24[] memory colors = new uint24[](0);

        vm.prank(alice);
        vm.expectRevert("empty");
        canvas.placePixels(xs, ys, colors);
    }

    function test_placePixels_singleElement() public {
        uint16[] memory xs = new uint16[](1);
        uint16[] memory ys = new uint16[](1);
        uint24[] memory colors = new uint24[](1);

        xs[0] = 500; ys[0] = 500; colors[0] = 0xAAAAAA;

        vm.prank(alice);
        canvas.placePixels(xs, ys, colors);

        assertEq(token.balanceOf(DEAD), BURN_PER_PIXEL);
    }
}
