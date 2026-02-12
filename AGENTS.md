# Agent / Bot Integration

THE $X HOMEPAGE is a 1000x1000 pixel canvas on Base. Burn 1 VV token to place 1 pixel. Anyone (or anything) can draw.

## Contract

- **Chain:** Base (chainId 8453)
- **VV Token:** `0xd2969cc475a49e73182ae1c517add57db0f1c2ac`
- **Canvas Contract:** `TODO` (not yet deployed)
- **Cost:** 1,000 VV per pixel (18 decimals, so `1000000000000000000000` wei / 1e21)

## ABI

```json
[
  "function placePixel(uint16 x, uint16 y, uint24 color) external",
  "function placePixels(uint16[] calldata xs, uint16[] calldata ys, uint24[] calldata colors) external",
  "event PixelPlaced(address indexed user, uint16 x, uint16 y, uint24 color)"
]
```

## How It Works

1. **Approve** the Canvas contract to spend your VV tokens (standard ERC-20 `approve`)
2. **Call `placePixel`** with x (0-999), y (0-999), and a 24-bit RGB color
3. The contract transfers 1 VV to the burn address (`0x...dEaD`) and emits a `PixelPlaced` event
4. The frontend reads all `PixelPlaced` events to reconstruct the canvas — last write wins

### Coordinates

- `x`: 0 (left) to 999 (right)
- `y`: 0 (top) to 999 (bottom)
- Out-of-bounds values revert

### Color

24-bit RGB packed into a `uint24`:

| Color   | Hex        | uint24    |
|---------|------------|-----------|
| Red     | `#FF0000`  | 16711680  |
| Green   | `#00FF00`  | 65280     |
| Blue    | `#0000FF`  | 255       |
| White   | `#FFFFFF`  | 16777215  |
| Black   | `#000000`  | 0         |

Formula: `(r << 16) | (g << 8) | b`

## Batch Placement

Use `placePixels` to place multiple pixels in one transaction. Pass three arrays of equal length:

- `xs`: x-coordinates
- `ys`: y-coordinates
- `colors`: 24-bit colors

Burns `n` VV tokens in a single `transferFrom` call. More gas efficient than individual calls.

## Examples

### JavaScript (ethers.js v6)

```javascript
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const VV = "0xd2969cc475a49e73182ae1c517add57db0f1c2ac";
const CANVAS = "CANVAS_ADDRESS_HERE";

const token = new ethers.Contract(VV, [
  "function approve(address spender, uint256 amount) returns (bool)"
], wallet);

const canvas = new ethers.Contract(CANVAS, [
  "function placePixel(uint16 x, uint16 y, uint24 color) external",
  "function placePixels(uint16[] xs, uint16[] ys, uint24[] colors) external"
], wallet);

// One-time approval
await token.approve(CANVAS, ethers.MaxUint256);

// Place a single red pixel at (500, 500)
await canvas.placePixel(500, 500, 0xFF0000);

// Place a batch — draw a horizontal blue line
const xs = [100, 101, 102, 103, 104];
const ys = [200, 200, 200, 200, 200];
const colors = [0x0000FF, 0x0000FF, 0x0000FF, 0x0000FF, 0x0000FF];
await canvas.placePixels(xs, ys, colors);
```

### Python (web3.py)

```python
from web3 import Web3

w3 = Web3(Web3.HTTPProvider("https://mainnet.base.org"))
account = w3.eth.account.from_key(PRIVATE_KEY)

CANVAS = "CANVAS_ADDRESS_HERE"
canvas_abi = [
    {
        "inputs": [
            {"name": "x", "type": "uint16"},
            {"name": "y", "type": "uint16"},
            {"name": "color", "type": "uint24"}
        ],
        "name": "placePixel",
        "outputs": [],
        "type": "function"
    }
]

canvas = w3.eth.contract(address=CANVAS, abi=canvas_abi)

# Place a white pixel at (0, 0)
tx = canvas.functions.placePixel(0, 0, 0xFFFFFF).build_transaction({
    "from": account.address,
    "nonce": w3.eth.get_transaction_count(account.address),
    "gas": 100000,
})
signed = account.sign_transaction(tx)
w3.eth.send_raw_transaction(signed.raw_transaction)
```

### cast (Foundry CLI)

```bash
# Approve
cast send $VV_TOKEN "approve(address,uint256)" $CANVAS_ADDRESS $(cast max-uint) \
  --rpc-url https://mainnet.base.org --private-key $PK

# Place pixel
cast send $CANVAS_ADDRESS "placePixel(uint16,uint16,uint24)" 500 500 16711680 \
  --rpc-url https://mainnet.base.org --private-key $PK
```

## Reading the Canvas

To reconstruct the current canvas state, query all `PixelPlaced` events from the contract:

```javascript
const canvas = new ethers.Contract(CANVAS, [
  "event PixelPlaced(address indexed user, uint16 x, uint16 y, uint24 color)"
], provider);

const events = await canvas.queryFilter("PixelPlaced", 0, "latest");

// Build a 1000x1000 pixel map — last event per coordinate wins
const pixels = {};
for (const e of events) {
  const { x, y, color } = e.args;
  pixels[`${x},${y}`] = Number(color);
}
```

## Rules

- 1,000 VV burned per pixel (1B supply / 1M pixels)
- Any pixel can be overwritten by anyone at any time
- Last write wins — there is no protection or refund
- All burns are final — tokens are sent to the dead address
- The canvas is 1000x1000 (1 million pixels)
