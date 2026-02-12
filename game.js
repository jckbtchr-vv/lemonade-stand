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

// Sync pixel buffer → off-screen ImageData → off-screen canvas
function syncBuffer() {
  if (!bufferDirty) return;
  imageData.data.set(pixelBuffer);
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
    ctx.lineWidth = 0.5;
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

  // Hover highlight
  if (hoverX >= 0 && hoverX < GRID_SIZE && hoverY >= 0 && hoverY < GRID_SIZE) {
    const sx = (hoverX - viewX) * zoom;
    const sy = (hoverY - viewY) * zoom;
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
    showStatus(`${count} pixel${count > 1 ? "s" : ""} burned`);
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

  const coordsEl = document.getElementById("coords");
  if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE) {
    coordsEl.textContent = `(${gx}, ${gy})`;
  } else {
    coordsEl.textContent = "(---, ---)";
  }

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
    const mc = formatUsdCompact(tokenMarketCap);
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
  const colorInt = hexToUint24(selectedColor);
  const xs = pendingPixels.map(p => p.x);
  const ys = pendingPixels.map(p => p.y);
  const colors = xs.map(() => colorInt);

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

    showStatus(`${count} pixel${count > 1 ? "s" : ""} burned`);
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

    events.forEach((e) => {
      const x = Number(e.args.x);
      const y = Number(e.args.y);
      const color = Number(e.args.color);
      const r = (color >> 16) & 0xff;
      const g = (color >> 8) & 0xff;
      const b = color & 0xff;
      setPixel(x, y, r, g, b);
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
    canvasContract.on("PixelPlaced", (user, x, y, color) => {
      const xi = Number(x);
      const yi = Number(y);
      const ci = Number(color);
      const r = (ci >> 16) & 0xff;
      const g = (ci >> 8) & 0xff;
      const b = ci & 0xff;
      setPixel(xi, yi, r, g, b);
      totalPixels++;
      document.getElementById("pixelCount").textContent = totalPixels.toLocaleString();
      updatePixelStats();
      queueRender();
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
function showStatus(msg) {
  const el = document.getElementById("status");
  if (!msg) {
    el.classList.remove("visible");
    return;
  }
  el.textContent = msg;
  el.classList.add("visible");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => el.classList.remove("visible"), 4000);
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
  if (pendingPixels.length === 0) return;
  if (e.key === "Escape") clearPending();
  if (e.key === "Enter") burnPending();
});

// Auto-connect if wallet already authorized
if (window.ethereum && window.ethereum.selectedAddress) {
  connectWallet();
}
