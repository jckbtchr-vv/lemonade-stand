// THE $X HOMEPAGE — Burn 1 VV, place 1 pixel
// Token: 0xd2969cc475a49e73182ae1c517add57db0f1c2ac (Base)

// --- Config -------------------------------------------------------------------

const BASE_CHAIN_ID = 8453n;
const TOKEN_ADDRESS = "0xd2969cc475a49e73182ae1c517add57db0f1c2ac";
const CANVAS_ADDRESS = "0x0000000000000000000000000000000000000000"; // TODO: deploy and update
const GRID_SIZE = 1000;

const LOCAL_MODE = CANVAS_ADDRESS === "0x0000000000000000000000000000000000000000";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
];

const CANVAS_ABI = [
  "function placePixel(uint16 x, uint16 y, uint24 color) external",
  "function placePixels(uint16[] xs, uint16[] ys, uint24[] colors) external",
  "event PixelPlaced(address indexed user, uint16 x, uint16 y, uint24 color)"
];

const PALETTE = [
  "#FFFFFF", "#000000", "#FF0000",
  "#00FF00", "#0000FF", "#FFFF00",
];

// --- State --------------------------------------------------------------------

let provider = null;
let signer = null;
let userAddress = null;
let tokenDecimals = 18;
let burnAmount = 0n;
let totalPixels = 0;
let sessionPixels = 0;
let tokenPriceUsd = 0;
let tokenMarketCap = 0;

// Heatmap: track overwrite count per pixel
const heatmap = new Uint16Array(GRID_SIZE * GRID_SIZE);
let heatmapMode = false;
let maxHeat = 1;

// Pixel age: store block number of last paint per pixel
const pixelBlock = new Uint32Array(GRID_SIZE * GRID_SIZE);
// Owner address per pixel
const pixelOwner = new Array(GRID_SIZE * GRID_SIZE).fill(null);

// Time machine: all events in order
let allEvents = [];
let timeMachineActive = false;

// Pixel buffer: 1000x1000, 4 bytes per pixel (RGBA)
const pixelBuffer = new Uint8ClampedArray(GRID_SIZE * GRID_SIZE * 4);

// Off-screen buffer for fast rendering
const offCanvas = document.createElement("canvas");
offCanvas.width = GRID_SIZE;
offCanvas.height = GRID_SIZE;
const offCtx = offCanvas.getContext("2d");
let imageData = offCtx.createImageData(GRID_SIZE, GRID_SIZE);
let bufferDirty = true;

// Viewport
let viewX = 0;
let viewY = 0;
let zoom = 1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 40;

let selectedColor = "#FFFFFF";
let hoverX = -1;
let hoverY = -1;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panStartViewX = 0;
let panStartViewY = 0;
let renderQueued = false;

// Drawing state
let isDrawing = false;
let lastDrawX = -1;
let lastDrawY = -1;

// Pending pixels (accumulate across strokes until burn/clear)
let pendingPixels = []; // [{x, y, origR, origG, origB}]
let pendingSet = new Set();

// Local mode wallet simulation
let localBalance = 1_000_000_000;

// --- Canvas Setup -------------------------------------------------------------

const canvas = document.getElementById("grid");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx.imageSmoothingEnabled = false;
  render();
}

window.addEventListener("resize", resizeCanvas);

// --- Init pixel buffer to black -----------------------------------------------

function initBuffer() {
  for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
    const idx = i * 4;
    pixelBuffer[idx] = 0;
    pixelBuffer[idx + 1] = 0;
    pixelBuffer[idx + 2] = 0;
    pixelBuffer[idx + 3] = 255;
  }
  bufferDirty = true;
}

function setPixel(x, y, r, g, b) {
  const idx = (y * GRID_SIZE + x) * 4;
  pixelBuffer[idx] = r;
  pixelBuffer[idx + 1] = g;
  pixelBuffer[idx + 2] = b;
  pixelBuffer[idx + 3] = 255;
  bufferDirty = true;
}

function trackHeat(x, y) {
  const idx = y * GRID_SIZE + x;
  heatmap[idx]++;
  if (heatmap[idx] > maxHeat) maxHeat = heatmap[idx];
}

// Sync pixel buffer → off-screen ImageData → off-screen canvas
function syncBuffer() {
  if (!bufferDirty) return;
  if (heatmapMode) {
    const data = imageData.data;
    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
      const heat = heatmap[i];
      const idx = i * 4;
      if (heat === 0) {
        data[idx] = 0; data[idx + 1] = 0; data[idx + 2] = 0; data[idx + 3] = 255;
      } else {
        const intensity = Math.min(255, Math.floor((heat / maxHeat) * 255));
        // Black → Red → Yellow → White gradient
        if (intensity < 128) {
          data[idx] = intensity * 2; data[idx + 1] = 0; data[idx + 2] = 0;
        } else if (intensity < 200) {
          data[idx] = 255; data[idx + 1] = (intensity - 128) * 3.5; data[idx + 2] = 0;
        } else {
          data[idx] = 255; data[idx + 1] = 255; data[idx + 2] = (intensity - 200) * 4.6;
        }
        data[idx + 3] = 255;
      }
    }
  } else {
    imageData.data.set(pixelBuffer);
  }
  offCtx.putImageData(imageData, 0, 0);
  bufferDirty = false;
}

// --- Rendering ----------------------------------------------------------------

function render() {
  syncBuffer();

  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, w, h);

  // Draw the entire grid as a scaled image — fast
  const srcX = Math.max(0, Math.floor(viewX));
  const srcY = Math.max(0, Math.floor(viewY));
  const srcW = Math.min(GRID_SIZE - srcX, Math.ceil(w / zoom) + 1);
  const srcH = Math.min(GRID_SIZE - srcY, Math.ceil(h / zoom) + 1);

  const dstX = (srcX - viewX) * zoom;
  const dstY = (srcY - viewY) * zoom;
  const dstW = srcW * zoom;
  const dstH = srcH * zoom;

  ctx.drawImage(offCanvas, srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH);

  // Grid lines when zoomed in close enough
  if (zoom >= 6) {
    const startCol = Math.max(0, Math.floor(viewX));
    const startRow = Math.max(0, Math.floor(viewY));
    const endCol = Math.min(GRID_SIZE, startCol + Math.ceil(w / zoom) + 1);
    const endRow = Math.min(GRID_SIZE, startRow + Math.ceil(h / zoom) + 1);
    const offsetX = (startCol - viewX) * zoom;
    const offsetY = (startRow - viewY) * zoom;

    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let col = startCol; col <= endCol; col++) {
      const sx = offsetX + (col - startCol) * zoom;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
    }
    for (let row = startRow; row <= endRow; row++) {
      const sy = offsetY + (row - startRow) * zoom;
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
    }
    ctx.stroke();
  }

  // Hover highlight with color preview
  if (hoverX >= 0 && hoverX < GRID_SIZE && hoverY >= 0 && hoverY < GRID_SIZE) {
    const sx = (hoverX - viewX) * zoom;
    const sy = (hoverY - viewY) * zoom;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = selectedColor;
    ctx.fillRect(sx, sy, zoom, zoom);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(sx, sy, zoom, zoom);
  }
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

// --- Screen ↔ Grid conversion -------------------------------------------------

function screenToGrid(sx, sy) {
  const gx = Math.floor(viewX + sx / zoom);
  const gy = Math.floor(viewY + sy / zoom);
  return [gx, gy];
}

// --- Line interpolation (Bresenham) -------------------------------------------

function getLinePixels(x0, y0, x1, y1) {
  const pixels = [];
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    pixels.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
  return pixels;
}

// --- Drawing Strokes ----------------------------------------------------------

function startStroke(screenX, screenY) {
  isDrawing = true;
  const [gx, gy] = screenToGrid(screenX, screenY);
  addToPending(gx, gy);
  lastDrawX = gx;
  lastDrawY = gy;
}

function continueStroke(screenX, screenY) {
  const [gx, gy] = screenToGrid(screenX, screenY);
  if (gx === lastDrawX && gy === lastDrawY) return;

  const linePixels = getLinePixels(lastDrawX, lastDrawY, gx, gy);
  for (const [px, py] of linePixels) {
    addToPending(px, py);
  }
  lastDrawX = gx;
  lastDrawY = gy;
}

function addToPending(x, y) {
  if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return;
  const key = `${x},${y}`;
  if (pendingSet.has(key)) return;
  pendingSet.add(key);

  // Save original color for undo
  const idx = (y * GRID_SIZE + x) * 4;
  const origR = pixelBuffer[idx];
  const origG = pixelBuffer[idx + 1];
  const origB = pixelBuffer[idx + 2];

  pendingPixels.push({ x, y, origR, origG, origB });

  // Draw preview immediately
  const { r, g, b } = hexToRgb(selectedColor);
  setPixel(x, y, r, g, b);
  queueRender();
  updatePendingBar();
}

function endStroke() {
  isDrawing = false;
}

// --- Pending Bar --------------------------------------------------------------

function updatePendingBar() {
  const bar = document.getElementById("pendingBar");
  const info = document.getElementById("pendingInfo");
  const count = pendingPixels.length;

  if (count === 0) {
    bar.style.display = "none";
    return;
  }

  bar.style.display = "flex";
  const vvCost = count * 1000;
  const usdCost = vvCost * tokenPriceUsd;
  let text = `${count} pixel${count > 1 ? "s" : ""} for ${vvCost.toLocaleString()} VV`;
  if (tokenPriceUsd > 0) text += ` (${formatUsd(usdCost)})`;
  info.textContent = text;
}

function burnPending() {
  const count = pendingPixels.length;
  if (count === 0) return;

  // Show confirm popover
  const vvCost = count * 1000;
  const usdCost = vvCost * tokenPriceUsd;
  let text = `${count} pixel${count > 1 ? "s" : ""} — ${vvCost.toLocaleString()} VV`;
  if (tokenPriceUsd > 0) text += ` (${formatUsd(usdCost)})`;

  document.getElementById("confirmCost").textContent = text;
  document.getElementById("confirmOverlay").style.display = "flex";
}

function confirmBurn() {
  document.getElementById("confirmOverlay").style.display = "none";

  const count = pendingPixels.length;
  if (count === 0) return;

  if (LOCAL_MODE) {
    localBalance -= count * 1000;
    document.getElementById("balance").textContent = localBalance.toLocaleString() + " VV";
    totalPixels += count;
    sessionPixels += count;
    document.getElementById("pixelCount").textContent = totalPixels.toLocaleString();
    updatePixelStats();
    updateSessionCost();
    const burned = [...pendingPixels];
    addFeedItem("0xDEMO...demo", count);
    showStatus(`${count} pixel${count > 1 ? "s" : ""} burned`, () => shareToTwitter(burned, selectedColor));
    pendingPixels = [];
    pendingSet = new Set();
    updatePendingBar();
  } else {
    placePixelsBatch();
  }
}

function cancelBurn() {
  document.getElementById("confirmOverlay").style.display = "none";
}

function clearPending() {
  for (const p of pendingPixels) {
    setPixel(p.x, p.y, p.origR, p.origG, p.origB);
  }
  pendingPixels = [];
  pendingSet = new Set();
  queueRender();
  updatePendingBar();
}

window.burnPending = burnPending;
window.confirmBurn = confirmBurn;
window.cancelBurn = cancelBurn;
window.clearPending = clearPending;

// --- Input Handlers -----------------------------------------------------------

canvas.addEventListener("mousemove", (e) => {
  if (isPanning) {
    const dx = e.clientX - panStartX;
    const dy = e.clientY - panStartY;
    viewX = panStartViewX - dx / zoom;
    viewY = panStartViewY - dy / zoom;
    clampView();
    queueRender();
  }

  if (isDrawing) {
    continueStroke(e.clientX, e.clientY);
  }

  const [gx, gy] = screenToGrid(e.clientX, e.clientY);
  hoverX = gx;
  hoverY = gy;

  updateCoordsDisplay(gx, gy);

  if (!isPanning && !isDrawing) queueRender();
});

canvas.addEventListener("mousedown", (e) => {
  if (e.button === 1 || e.button === 2 || e.shiftKey) {
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panStartViewX = viewX;
    panStartViewY = viewY;
    canvas.style.cursor = "grabbing";
    e.preventDefault();
  } else if (e.button === 0) {
    startStroke(e.clientX, e.clientY);
  }
});

canvas.addEventListener("mouseup", (e) => {
  if (isPanning) {
    isPanning = false;
    canvas.style.cursor = "crosshair";
    return;
  }

  if (isDrawing) {
    endStroke();
  }
});

// Stop drawing if mouse leaves the window
window.addEventListener("mouseup", () => {
  if (isDrawing) endStroke();
  if (isPanning) {
    isPanning = false;
    canvas.style.cursor = "crosshair";
  }
});

document.addEventListener("mouseleave", () => {
  if (isDrawing) endStroke();
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// --- Touch Support ------------------------------------------------------------

let lastTouchDist = 0;
let touchMode = null; // "draw" | "pinch"

canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  if (e.touches.length === 2) {
    touchMode = "pinch";
    lastTouchDist = getTouchDist(e.touches);
    const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    panStartX = cx;
    panStartY = cy;
    panStartViewX = viewX;
    panStartViewY = viewY;
  } else if (e.touches.length === 1) {
    touchMode = "draw";
    const t = e.touches[0];
    startStroke(t.clientX, t.clientY);
    const [gx, gy] = screenToGrid(t.clientX, t.clientY);
    hoverX = gx;
    hoverY = gy;
    updateCoordsDisplay(gx, gy);
  }
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  if (touchMode === "pinch" && e.touches.length === 2) {
    const dist = getTouchDist(e.touches);
    const factor = dist / lastTouchDist;
    lastTouchDist = dist;

    const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    const [gxBefore] = screenToGrid(cx, cy);
    const [, gyBefore] = screenToGrid(cx, cy);

    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
    viewX = gxBefore - cx / zoom;
    viewY = gyBefore - cy / zoom;

    // Pan
    const dx = cx - panStartX;
    const dy = cy - panStartY;
    viewX = panStartViewX - dx / zoom;
    viewY = panStartViewY - dy / zoom;

    clampView();
    queueRender();
  } else if (touchMode === "draw" && e.touches.length === 1) {
    const t = e.touches[0];
    if (isDrawing) continueStroke(t.clientX, t.clientY);
    const [gx, gy] = screenToGrid(t.clientX, t.clientY);
    hoverX = gx;
    hoverY = gy;
    updateCoordsDisplay(gx, gy);
    queueRender();
  }
}, { passive: false });

canvas.addEventListener("touchend", (e) => {
  e.preventDefault();
  if (isDrawing) endStroke();
  if (e.touches.length === 0) touchMode = null;
});

function getTouchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function updateCoordsDisplay(gx, gy) {
  const coordsEl = document.getElementById("coords");
  if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE) {
    const idx = gy * GRID_SIZE + gx;
    const owner = pixelOwner[idx];
    if (owner) {
      coordsEl.textContent = `(${gx}, ${gy}) ${shorten(owner)}`;
    } else {
      coordsEl.textContent = `(${gx}, ${gy})`;
    }
  } else {
    coordsEl.textContent = "(---, ---)";
  }
}

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const [gxBefore, gyBefore] = screenToGrid(e.clientX, e.clientY);

  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));

  viewX = gxBefore - e.clientX / zoom;
  viewY = gyBefore - e.clientY / zoom;
  clampView();
  queueRender();
}, { passive: false });

function clampView() {
  const viewW = canvas.width / zoom;
  const viewH = canvas.height / zoom;

  if (viewW >= GRID_SIZE) {
    const minX = -(viewW - GRID_SIZE) / 2;
    const maxX = (viewW - GRID_SIZE) / 2;
    viewX = Math.max(minX, Math.min(viewX, maxX));
  } else {
    viewX = Math.max(0, Math.min(viewX, GRID_SIZE - viewW));
  }

  if (viewH >= GRID_SIZE) {
    const minY = -(viewH - GRID_SIZE) / 2;
    const maxY = (viewH - GRID_SIZE) / 2;
    viewY = Math.max(minY, Math.min(viewY, maxY));
  } else {
    viewY = Math.max(0, Math.min(viewY, GRID_SIZE - viewH));
  }
}

// --- Color Palette ------------------------------------------------------------

function buildPalette() {
  const container = document.getElementById("palette");
  container.innerHTML = "";

  PALETTE.forEach((color) => {
    const el = document.createElement("div");
    el.className = "swatch" + (color === selectedColor ? " active" : "");
    el.style.backgroundColor = color;
    el.onclick = () => selectColor(color);
    container.appendChild(el);
  });

  const input = document.createElement("input");
  input.type = "text";
  input.className = "hex-input";
  input.value = selectedColor;
  input.maxLength = 7;
  input.addEventListener("change", () => {
    const val = input.value.trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      selectColor(val.toUpperCase());
    }
  });
  container.appendChild(input);
}

function selectColor(color) {
  selectedColor = color;
  buildPalette();
}

// --- Token Price / Market Cap -------------------------------------------------

let lastPriceFetch = 0;
async function fetchTokenData() {
  const now = Date.now();
  if (now - lastPriceFetch < 5000) return; // 30s cache
  lastPriceFetch = now;

  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${TOKEN_ADDRESS}`);
    const data = await res.json();
    if (data.pairs && data.pairs[0]) {
      const pair = data.pairs[0];
      tokenPriceUsd = parseFloat(pair.priceUsd) || 0;
      tokenMarketCap = pair.fdv || pair.marketCap || 0;

      updateTitle();
      updateMacroStats(pair);

      const costEl = document.getElementById("pixelCost");
      const pricePerPixel = tokenPriceUsd * 1000;
      if (costEl) costEl.textContent = pricePerPixel > 0 ? `1,000 VV (${formatUsd(pricePerPixel)})` : "1,000 VV";

      updateSessionCost();
    }
  } catch (e) {
    console.error("Price fetch failed", e);
  }
}

function updateSessionCost() {
  const el = document.getElementById("sessionCost");
  if (el) {
    const cost = sessionPixels * 1000 * tokenPriceUsd;
    el.textContent = formatUsd(cost);
  }
}

function updateMacroStats(pair) {
  const priceEl = document.getElementById("statPrice");
  const fdvEl = document.getElementById("statFdv");
  const changeEl = document.getElementById("stat24h");

  if (priceEl) priceEl.textContent = tokenPriceUsd > 0 ? formatUsd(tokenPriceUsd) : "-";
  if (fdvEl) fdvEl.textContent = tokenMarketCap > 0 ? formatUsdCompact(tokenMarketCap) : "-";

  if (changeEl && pair.priceChange) {
    const change = pair.priceChange.h24;
    if (change != null) {
      const sign = change >= 0 ? "+" : "";
      changeEl.textContent = `${sign}${change.toFixed(2)}%`;
      changeEl.style.color = change >= 0 ? "#4f4" : "#f44";
    }
  }
}

function updatePixelStats() {
  const pixelsEl = document.getElementById("statPixels");
  const burnedEl = document.getElementById("statBurned");
  if (pixelsEl) pixelsEl.textContent = totalPixels.toLocaleString();
  if (burnedEl) burnedEl.textContent = (totalPixels * 1000).toLocaleString() + " VV";
}

async function updateBlock() {
  try {
    const res = await fetch("https://mainnet.base.org", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 })
    });
    const data = await res.json();
    const block = parseInt(data.result, 16);
    const el = document.getElementById("statBlock");
    if (el) el.textContent = block.toLocaleString();
  } catch (e) {
    console.error("Block fetch failed", e);
  }
}

function updateTitle() {
  const el = document.getElementById("dynamicTitle");
  if (!el) return;
  if (tokenMarketCap > 0) {
    const mc = "$" + Math.round(tokenMarketCap).toLocaleString();
    el.textContent = `THE ${mc} HOMEPAGE`;
    document.title = `THE ${mc} HOMEPAGE`;
  } else {
    el.textContent = "THE HOMEPAGE";
    document.title = "THE HOMEPAGE";
  }
}

// --- Wallet -------------------------------------------------------------------

async function connectWallet() {
  if (userAddress) {
    disconnectWallet();
    return;
  }

  if (!window.ethereum) {
    showStatus("No wallet found");
    return;
  }

  provider = new ethers.BrowserProvider(window.ethereum);
  const accounts = await provider.send("eth_requestAccounts", []);
  if (!accounts.length) return;

  signer = await provider.getSigner();
  userAddress = await signer.getAddress();

  document.getElementById("address").textContent = shorten(userAddress);
  document.getElementById("connectBtn").textContent = "Disconnect";

  const net = await provider.getNetwork();
  if (net.chainId !== BASE_CHAIN_ID) {
    showStatus("Switch to Base network");
  }

  await updateBalance();

  if (!LOCAL_MODE) {
    await loadPixels();
    listenForPixels();
  }
}

function disconnectWallet() {
  provider = null;
  signer = null;
  userAddress = null;
  document.getElementById("address").textContent = "---";
  document.getElementById("balance").textContent = "-";
  document.getElementById("connectBtn").textContent = "Connect";
}

window.connectWallet = connectWallet;

async function updateBalance() {
  if (!provider || !userAddress) return;
  const token = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, provider);
  const dec = await token.decimals();
  tokenDecimals = Number(dec);
  burnAmount = 1000n * (10n ** BigInt(tokenDecimals));

  const bal = await token.balanceOf(userAddress);
  const human = Number(ethers.formatUnits(bal, tokenDecimals));
  document.getElementById("balance").textContent = human.toFixed(2) + " VV";
}

// --- Pixel Placement (on-chain batch) -----------------------------------------

async function placePixelsBatch() {
  if (!signer) {
    showStatus("Connect wallet first");
    return;
  }

  const net = await provider.getNetwork();
  if (net.chainId !== BASE_CHAIN_ID) {
    showStatus("Switch to Base network");
    return;
  }

  const count = pendingPixels.length;
  const xs = pendingPixels.map(p => p.x);
  const ys = pendingPixels.map(p => p.y);
  const colors = pendingPixels.map(p => {
    // Read actual color from pixel buffer (supports imported images with per-pixel colors)
    const idx = (p.y * GRID_SIZE + p.x) * 4;
    return (pixelBuffer[idx] << 16) | (pixelBuffer[idx + 1] << 8) | pixelBuffer[idx + 2];
  });

  try {
    showStatus("Checking allowance...");
    const token = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, signer);
    const needed = burnAmount * BigInt(count);
    const allowance = await token.allowance(userAddress, CANVAS_ADDRESS);

    if (allowance < needed) {
      showStatus("Approving VV...");
      const approveTx = await token.approve(CANVAS_ADDRESS, ethers.MaxUint256);
      await approveTx.wait();
    }

    showStatus(`Burning ${count} VV...`);
    const canvasContract = new ethers.Contract(CANVAS_ADDRESS, CANVAS_ABI, signer);

    let tx;
    if (count === 1) {
      tx = await canvasContract.placePixel(xs[0], ys[0], colors[0]);
    } else {
      tx = await canvasContract.placePixels(xs, ys, colors);
    }
    await tx.wait();

    totalPixels += count;
    sessionPixels += count;
    document.getElementById("pixelCount").textContent = totalPixels.toLocaleString();
    updatePixelStats();
    updateSessionCost();

    const burned = [...pendingPixels];
    showStatus(`${count} pixel${count > 1 ? "s" : ""} burned`, () => shareToTwitter(burned, selectedColor));
    pendingPixels = [];
    pendingSet = new Set();
    updatePendingBar();
    await updateBalance();
  } catch (err) {
    console.error(err);
    clearPending();
    if (err.code === "ACTION_REJECTED") {
      showStatus("Cancelled");
    } else {
      showStatus("Something went wrong");
    }
  }
}

// --- Load existing pixels from events -----------------------------------------

async function loadPixels() {
  if (!provider || LOCAL_MODE) return;
  showStatus("Loading canvas...");

  try {
    const canvasContract = new ethers.Contract(CANVAS_ADDRESS, CANVAS_ABI, provider);
    const filter = canvasContract.filters.PixelPlaced();
    const events = await canvasContract.queryFilter(filter, 0, "latest");

    totalPixels = events.length;

    allEvents = events.map((e) => ({
      x: Number(e.args.x),
      y: Number(e.args.y),
      color: Number(e.args.color),
      user: e.args.user,
      block: e.blockNumber,
    }));

    allEvents.forEach((ev) => {
      const { x, y, color, user, block } = ev;
      const r = (color >> 16) & 0xff;
      const g = (color >> 8) & 0xff;
      const b = color & 0xff;
      setPixel(x, y, r, g, b);
      trackHeat(x, y);
      const idx = y * GRID_SIZE + x;
      pixelBlock[idx] = block;
      pixelOwner[idx] = user;
    });

    document.getElementById("pixelCount").textContent = totalPixels.toLocaleString();
    updatePixelStats();
    queueRender();
    showStatus("");
  } catch (err) {
    console.error("Failed to load pixels:", err);
    showStatus("Canvas contract not deployed yet");
  }
}

function listenForPixels() {
  if (!provider || LOCAL_MODE) return;
  try {
    const canvasContract = new ethers.Contract(CANVAS_ADDRESS, CANVAS_ABI, provider);
    let feedBatch = {};
    let feedTimer = null;

    canvasContract.on("PixelPlaced", (user, x, y, color) => {
      const xi = Number(x);
      const yi = Number(y);
      const ci = Number(color);
      const r = (ci >> 16) & 0xff;
      const g = (ci >> 8) & 0xff;
      const b = ci & 0xff;
      setPixel(xi, yi, r, g, b);
      trackHeat(xi, yi);
      const pidx = yi * GRID_SIZE + xi;
      pixelOwner[pidx] = user;
      totalPixels++;
      document.getElementById("pixelCount").textContent = totalPixels.toLocaleString();
      updatePixelStats();
      queueRender();

      // Batch feed items per user (events arrive in rapid succession for batch txs)
      const addr = user;
      feedBatch[addr] = (feedBatch[addr] || 0) + 1;
      clearTimeout(feedTimer);
      feedTimer = setTimeout(() => {
        for (const [a, c] of Object.entries(feedBatch)) {
          addFeedItem(a, c);
        }
        feedBatch = {};
      }, 500);
    });
  } catch (err) {
    console.error("Event listener failed:", err);
  }
}

// --- Download -----------------------------------------------------------------

function downloadFull() {
  syncBuffer();
  const link = document.createElement("a");
  link.download = "canvas.png";
  link.href = offCanvas.toDataURL("image/png");
  link.click();
}

function downloadGrid() {
  syncBuffer();
  const tileSize = Math.floor(GRID_SIZE / 3);

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const tile = document.createElement("canvas");
      tile.width = tileSize;
      tile.height = tileSize;
      const tileCtx = tile.getContext("2d");

      tileCtx.drawImage(
        offCanvas,
        col * tileSize, row * tileSize, tileSize, tileSize,
        0, 0, tileSize, tileSize
      );

      const link = document.createElement("a");
      link.download = `canvas_${row + 1}x${col + 1}.png`;
      link.href = tile.toDataURL("image/png");
      link.click();
    }
  }
}

function shareToTwitter(pixels, color) {
  const count = pixels.length;
  const vvCost = count * 1000;
  const mc = tokenMarketCap > 0 ? " on THE $" + Math.round(tokenMarketCap).toLocaleString() + " HOMEPAGE" : "";
  const text = `Burned ${vvCost.toLocaleString()} VV for ${count} pixel${count > 1 ? "s" : ""}${mc}`;
  const url = encodeURIComponent(window.location.origin + window.location.pathname);
  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${url}`, "_blank");
}

// --- Live Feed ----------------------------------------------------------------

const MAX_FEED_ITEMS = 5;

function addFeedItem(address, count) {
  const feed = document.getElementById("feed");
  if (!feed) return;

  const item = document.createElement("div");
  item.className = "feed-item";
  item.textContent = `${shorten(address)} burned ${(count * 1000).toLocaleString()} VV (${count} px)`;

  feed.appendChild(item);

  // Keep max items
  while (feed.children.length > MAX_FEED_ITEMS) {
    feed.removeChild(feed.firstChild);
  }

  // Fade out after 8s
  setTimeout(() => {
    item.style.opacity = "0";
    setTimeout(() => item.remove(), 500);
  }, 8000);
}

// --- Image Import -------------------------------------------------------------

function importImage(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      // Scale image to fit within the grid, max 100x100 by default
      const maxDim = Math.min(100, GRID_SIZE);
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        const scale = maxDim / Math.max(w, h);
        w = Math.floor(w * scale);
        h = Math.floor(h * scale);
      }

      // Draw to temp canvas to read pixels
      const tmp = document.createElement("canvas");
      tmp.width = w;
      tmp.height = h;
      const tmpCtx = tmp.getContext("2d");
      tmpCtx.drawImage(img, 0, 0, w, h);
      const data = tmpCtx.getImageData(0, 0, w, h).data;

      // Place at center of current view
      const startX = Math.floor(viewX + (canvas.width / zoom) / 2 - w / 2);
      const startY = Math.floor(viewY + (canvas.height / zoom) / 2 - h / 2);

      let count = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const si = (y * w + x) * 4;
          const r = data[si], g = data[si + 1], b = data[si + 2], a = data[si + 3];
          if (a < 128) continue; // skip transparent pixels

          const gx = startX + x;
          const gy = startY + y;
          if (gx < 0 || gx >= GRID_SIZE || gy < 0 || gy >= GRID_SIZE) continue;

          const key = `${gx},${gy}`;
          if (pendingSet.has(key)) continue;
          pendingSet.add(key);

          const pidx = (gy * GRID_SIZE + gx) * 4;
          pendingPixels.push({
            x: gx, y: gy,
            origR: pixelBuffer[pidx],
            origG: pixelBuffer[pidx + 1],
            origB: pixelBuffer[pidx + 2],
          });

          setPixel(gx, gy, r, g, b);
          count++;
        }
      }

      // Temporarily override selected color for the import — each pixel has its own color
      queueRender();
      updatePendingBar();
      showStatus(`Imported ${count} pixels — review and burn`);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  input.value = ""; // reset so same file can be re-imported
}
window.importImage = importImage;

function onTimeSlider(val) {
  const n = parseInt(val);
  replayEvents(n);
  const label = document.getElementById("timeLabel");
  if (label) label.textContent = `${n.toLocaleString()} / ${allEvents.length.toLocaleString()}`;
}
window.onTimeSlider = onTimeSlider;

window.downloadFull = downloadFull;
window.downloadGrid = downloadGrid;

// --- Helpers ------------------------------------------------------------------

function hexToUint24(hex) {
  return parseInt(hex.replace("#", ""), 16);
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

// --- Time Machine -------------------------------------------------------------

function toggleTimeMachine() {
  const slider = document.getElementById("timeMachine");
  if (!slider) return;

  timeMachineActive = !timeMachineActive;
  slider.parentElement.style.display = timeMachineActive ? "flex" : "none";

  if (timeMachineActive) {
    slider.max = allEvents.length;
    slider.value = allEvents.length;
    showStatus("Time machine on (T to toggle)");
  } else {
    // Restore full canvas
    replayEvents(allEvents.length);
    showStatus("Time machine off");
  }
}

function replayEvents(upTo) {
  // Clear buffer to black
  for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
    const idx = i * 4;
    pixelBuffer[idx] = 0;
    pixelBuffer[idx + 1] = 0;
    pixelBuffer[idx + 2] = 0;
    pixelBuffer[idx + 3] = 255;
  }

  for (let i = 0; i < upTo && i < allEvents.length; i++) {
    const { x, y, color } = allEvents[i];
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    const idx = (y * GRID_SIZE + x) * 4;
    pixelBuffer[idx] = r;
    pixelBuffer[idx + 1] = g;
    pixelBuffer[idx + 2] = b;
  }

  bufferDirty = true;
  queueRender();
}

function toggleHeatmap() {
  heatmapMode = !heatmapMode;
  bufferDirty = true;
  queueRender();
  showStatus(heatmapMode ? "Heatmap on (H to toggle)" : "Heatmap off");
}

function shorten(a) {
  return a.slice(0, 6) + "..." + a.slice(-4);
}

function formatUsd(n) {
  if (n < 0.01 && n > 0) return "<$0.01";
  return "$" + n.toFixed(2);
}

function formatUsdCompact(n) {
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(2);
}

let statusTimer = null;
function showStatus(msg, shareCallback) {
  const el = document.getElementById("status");
  if (!msg) {
    el.classList.remove("visible");
    return;
  }
  el.innerHTML = "";
  el.appendChild(document.createTextNode(msg));
  if (shareCallback) {
    const btn = document.createElement("button");
    btn.textContent = "Share";
    btn.style.cssText = "margin-left:8px;padding:2px 8px;font-size:10px;";
    btn.onclick = shareCallback;
    el.appendChild(btn);
  }
  el.classList.add("visible");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => el.classList.remove("visible"), shareCallback ? 10000 : 4000);
}

// --- Boot ---------------------------------------------------------------------

initBuffer();
buildPalette();
fetchTokenData();
updateBlock();
setInterval(fetchTokenData, 5000);
setInterval(updateBlock, 5000);

// Center view
viewX = GRID_SIZE / 2 - window.innerWidth / (2 * zoom);
viewY = GRID_SIZE / 2 - window.innerHeight / (2 * zoom);

resizeCanvas();

if (LOCAL_MODE) {
  localBalance = 1_000_000_000;
  document.getElementById("balance").textContent = "1,000,000,000 VV";
  document.getElementById("address").textContent = "0xDEMO";
  showStatus("Demo mode — click or drag to draw");
}

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  const popover = document.getElementById("confirmOverlay");
  if (popover.style.display === "flex") {
    if (e.key === "Escape") cancelBurn();
    if (e.key === "Enter") confirmBurn();
    return;
  }
  if (e.key === "h" || e.key === "H") { toggleHeatmap(); return; }
  if (e.key === "t" || e.key === "T") { toggleTimeMachine(); return; }
  if (pendingPixels.length === 0) return;
  if (e.key === "Escape") clearPending();
  if (e.key === "Enter") burnPending();
});

// Auto-connect if wallet already authorized
if (window.ethereum && window.ethereum.selectedAddress) {
  connectWallet();
}
