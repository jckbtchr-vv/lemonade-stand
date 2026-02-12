// Canvas — Burn 1 LEMON, place 1 pixel
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
  "#FFFFFF", "#C0C0C0", "#808080", "#000000",
  "#FF0000", "#FF8800", "#FFFF00", "#00FF00",
  "#00FFFF", "#0088FF", "#0000FF", "#FF00FF",
];

// --- State --------------------------------------------------------------------

let provider = null;
let signer = null;
let userAddress = null;
let tokenDecimals = 18;
let burnAmount = 0n;
let totalPixels = 0;

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

  // Grid lines at higher zoom
  if (zoom >= 8) {
    const startCol = Math.max(0, Math.floor(viewX));
    const startRow = Math.max(0, Math.floor(viewY));
    const endCol = Math.min(GRID_SIZE, startCol + Math.ceil(w / zoom) + 1);
    const endRow = Math.min(GRID_SIZE, startRow + Math.ceil(h / zoom) + 1);
    const offsetX = (startCol - viewX) * zoom;
    const offsetY = (startRow - viewY) * zoom;

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
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

  const [gx, gy] = screenToGrid(e.clientX, e.clientY);
  hoverX = gx;
  hoverY = gy;

  const coordsEl = document.getElementById("coords");
  if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE) {
    coordsEl.textContent = `(${gx}, ${gy})`;
  } else {
    coordsEl.textContent = "(---, ---)";
  }

  if (!isPanning) queueRender();
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
  }
});

canvas.addEventListener("mouseup", (e) => {
  if (isPanning) {
    isPanning = false;
    canvas.style.cursor = "crosshair";
    return;
  }

  if (e.button === 0) {
    const [gx, gy] = screenToGrid(e.clientX, e.clientY);
    if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE) {
      placePixelOnChain(gx, gy);
    }
  }
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
  const maxViewX = GRID_SIZE - canvas.width / zoom;
  const maxViewY = GRID_SIZE - canvas.height / zoom;
  viewX = Math.max(0, Math.min(viewX, maxViewX));
  viewY = Math.max(0, Math.min(viewY, maxViewY));
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
  burnAmount = 10n ** BigInt(tokenDecimals);

  const bal = await token.balanceOf(userAddress);
  const human = Number(ethers.formatUnits(bal, tokenDecimals));
  document.getElementById("balance").textContent = human.toFixed(2) + " LEMON";
}

// --- Pixel Placement ----------------------------------------------------------

async function placePixelOnChain(x, y) {
  // Local mode — place immediately, no wallet needed
  if (LOCAL_MODE) {
    const { r, g, b } = hexToRgb(selectedColor);
    setPixel(x, y, r, g, b);
    totalPixels++;
    document.getElementById("pixelCount").textContent = totalPixels.toLocaleString();
    queueRender();
    return;
  }

  if (!signer) {
    showStatus("Connect wallet first");
    return;
  }

  const net = await provider.getNetwork();
  if (net.chainId !== BASE_CHAIN_ID) {
    showStatus("Switch to Base network");
    return;
  }

  const colorInt = hexToUint24(selectedColor);

  try {
    showStatus("Checking allowance...");

    const token = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, signer);
    const allowance = await token.allowance(userAddress, CANVAS_ADDRESS);

    if (allowance < burnAmount) {
      showStatus("Approve LEMON spend...");
      const approveTx = await token.approve(CANVAS_ADDRESS, ethers.MaxUint256);
      await approveTx.wait();
    }

    showStatus("Placing pixel...");
    const canvasContract = new ethers.Contract(CANVAS_ADDRESS, CANVAS_ABI, signer);
    const tx = await canvasContract.placePixel(x, y, colorInt);
    await tx.wait();

    const { r, g, b } = hexToRgb(selectedColor);
    setPixel(x, y, r, g, b);
    totalPixels++;
    document.getElementById("pixelCount").textContent = totalPixels.toLocaleString();
    queueRender();

    showStatus("Pixel placed!");
    await updateBalance();
  } catch (err) {
    console.error(err);
    if (err.code === "ACTION_REJECTED") {
      showStatus("Transaction rejected");
    } else {
      showStatus("Failed — check console");
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
      queueRender();
    });
  } catch (err) {
    console.error("Event listener failed:", err);
  }
}

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

// Center view
viewX = GRID_SIZE / 2 - window.innerWidth / (2 * zoom);
viewY = GRID_SIZE / 2 - window.innerHeight / (2 * zoom);

resizeCanvas();

if (LOCAL_MODE) {
  showStatus("Local mode — click to place pixels");
}

// Auto-connect if wallet already authorized
if (window.ethereum && window.ethereum.selectedAddress) {
  connectWallet();
}
