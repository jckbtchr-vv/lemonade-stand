// Pixel Canvas — burn $VV to toggle pixels
// Token: $VV on Base (0xd2969cc475a49e73182ae1c517add57db0f1c2ac)

const BASE_CHAIN_ID = 8453;
const TOKEN_ADDRESS = "0xd2969cc475a49e73182ae1c517add57db0f1c2ac";
const REQUIRED_BALANCE = 1000;
const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address, uint256) returns (bool)"
];

const GRID = 32;
const CELL = 13;
const GAP = 1;
const COST_PER_PIXEL = 0.01;

// colors
const C_OFF = "#1c1e26";
const C_ON = "#eab308";
const C_STAGE_ON = "#3b82f6";
const C_STAGE_OFF = "#ef4444";
const C_GRID_LINE = "#262938";

// --- wallet state ---

var provider = null;
var signer = null;
var userAddress = null;
var tokenContract = null;
var tokenDecimals = 18;
var lastBalance = 0;
var isEligible = false;
var txPending = false;

// --- canvas state ---

var grid = [];
var staged = new Set();
var totalToggles = 0;
var totalBurned = 0;
var canvas, ctx;

// --- grid init ---

function initGrid() {
  grid = [];
  for (var y = 0; y < GRID; y++) {
    grid[y] = [];
    for (var x = 0; x < GRID; x++) {
      grid[y][x] = 0;
    }
  }
}

function saveState() {
  localStorage.setItem("vv_canvas", JSON.stringify({
    grid: grid,
    totalToggles: totalToggles,
    totalBurned: totalBurned
  }));
}

function loadState() {
  try {
    var raw = localStorage.getItem("vv_canvas");
    if (!raw) return;
    var data = JSON.parse(raw);
    if (data.grid && data.grid.length === GRID) {
      grid = data.grid;
      totalToggles = data.totalToggles || 0;
      totalBurned = data.totalBurned || 0;
    }
  } catch (e) {}
}

// --- rendering ---

function drawGrid() {
  var size = GRID * (CELL + GAP) + GAP;
  ctx.fillStyle = C_GRID_LINE;
  ctx.fillRect(0, 0, size, size);

  for (var y = 0; y < GRID; y++) {
    for (var x = 0; x < GRID; x++) {
      var key = x + "," + y;
      var isOn = grid[y][x] === 1;
      var isStaged = staged.has(key);

      var color;
      if (isStaged) {
        color = isOn ? C_STAGE_OFF : C_STAGE_ON;
      } else {
        color = isOn ? C_ON : C_OFF;
      }

      ctx.fillStyle = color;
      ctx.fillRect(
        GAP + x * (CELL + GAP),
        GAP + y * (CELL + GAP),
        CELL, CELL
      );
    }
  }
}

function countLit() {
  var n = 0;
  for (var y = 0; y < GRID; y++) {
    for (var x = 0; x < GRID; x++) {
      if (grid[y][x] === 1) n++;
    }
  }
  return n;
}

function renderStats() {
  document.getElementById("pixelsLit").textContent = countLit();
  document.getElementById("totalToggles").textContent = totalToggles;
  document.getElementById("burned").textContent = totalBurned.toFixed(2);
}

function updateStagedUI() {
  var count = staged.size;
  var cost = (count * COST_PER_PIXEL).toFixed(2);
  document.getElementById("stagedCount").textContent = count;
  document.getElementById("stagedCost").textContent = cost;
  document.getElementById("applyBar").style.display = count > 0 ? "flex" : "none";
}

// --- interaction ---

function getPixelCoords(e) {
  var rect = canvas.getBoundingClientRect();
  var scale = canvas.width / rect.width;
  var clientX, clientY;

  if (e.touches && e.touches.length > 0) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }

  var mx = (clientX - rect.left) * scale;
  var my = (clientY - rect.top) * scale;

  var x = Math.floor(mx / (CELL + GAP));
  var y = Math.floor(my / (CELL + GAP));

  if (x < 0 || x >= GRID || y < 0 || y >= GRID) return null;
  return { x: x, y: y };
}

function onCanvasClick(e) {
  if (!isEligible || txPending) return;
  e.preventDefault();

  var pos = getPixelCoords(e);
  if (!pos) return;

  var key = pos.x + "," + pos.y;
  if (staged.has(key)) {
    staged.delete(key);
  } else {
    staged.add(key);
  }

  drawGrid();
  updateStagedUI();
}

function clearStaged() {
  staged.clear();
  drawGrid();
  updateStagedUI();
}

// --- burn ---

function showTx(msg) {
  var el = document.getElementById("txOverlay");
  var m = document.getElementById("txMsg");
  if (el) el.style.display = "flex";
  if (m) m.textContent = msg || "Awaiting transaction...";
  txPending = true;
}

function hideTx() {
  var el = document.getElementById("txOverlay");
  if (el) el.style.display = "none";
  txPending = false;
}

async function applyStaged() {
  if (!signer || !tokenContract || !isEligible || txPending) return;
  var count = staged.size;
  if (count === 0) return;

  var amount = count * COST_PER_PIXEL;
  if (lastBalance < amount) return;

  try {
    showTx("Burning " + amount.toFixed(2) + " $VV for " + count + " pixels...");
    var w = tokenContract.connect(signer);
    var wei = ethers.parseUnits(amount.toFixed(4), tokenDecimals);
    var tx = await w.transfer(BURN_ADDRESS, wei);
    showTx("Confirming...");
    await tx.wait();

    // apply staged changes to grid
    staged.forEach(function(key) {
      var parts = key.split(",");
      var x = parseInt(parts[0]);
      var y = parseInt(parts[1]);
      grid[y][x] = grid[y][x] === 1 ? 0 : 1;
    });

    totalToggles += count;
    totalBurned += amount;

    staged.clear();
    saveState();
    refreshBalance();
    hideTx();
    drawGrid();
    renderStats();
    updateStagedUI();
  } catch (err) {
    hideTx();
    if (err.code === "ACTION_REJECTED" || err.code === 4001) return;
    console.error("Burn failed:", err);
  }
}

// --- wallet ---

async function getChainId() {
  try {
    var hex = await provider.send("eth_chainId", []);
    return parseInt(hex, 16);
  } catch (e) {
    return 0;
  }
}

async function checkNetwork() {
  if (!provider) return;
  var id = await getChainId();
  var ok = id === BASE_CHAIN_ID;
  document.getElementById("netWarn").style.display = ok ? "none" : "inline";
  setEligible(lastBalance, ok);
}

async function refreshBalance() {
  if (!provider || !userAddress) return;
  try {
    var c = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, provider);
    var bal = await c.balanceOf(userAddress);
    var n = Number(ethers.formatUnits(bal, tokenDecimals));
    lastBalance = n;
    document.getElementById("bal").textContent = n.toFixed(2) + " $VV";
    var id = await getChainId();
    setEligible(n, id === BASE_CHAIN_ID);
  } catch (e) {
    document.getElementById("bal").textContent = "error";
  }
}

function setEligible(bal, isBase) {
  isEligible = isBase && bal >= REQUIRED_BALANCE;
  document.getElementById("gate").style.display = isEligible ? "none" : "block";
}

async function connectWallet() {
  if (userAddress) { disconnect(); return; }
  if (!window.ethereum) { alert("No wallet found."); return; }

  try {
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    userAddress = await signer.getAddress();
    tokenContract = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, provider);

    try {
      tokenDecimals = Number(await tokenContract.decimals());
    } catch (e) { tokenDecimals = 18; }

    document.getElementById("addr").textContent = userAddress.slice(0, 6) + "..." + userAddress.slice(-4);
    document.getElementById("connectBtn").textContent = "Disconnect";

    registerEvents();
    await checkNetwork();
    await refreshBalance();
  } catch (err) {
    if (err.code === 4001 || err.code === "ACTION_REJECTED") return;
    console.error("Connect failed:", err);
  }
}

function disconnect() {
  unregisterEvents();
  provider = signer = userAddress = tokenContract = null;
  lastBalance = 0;
  isEligible = false;

  document.getElementById("addr").textContent = "disconnected";
  document.getElementById("bal").textContent = "-";
  document.getElementById("connectBtn").textContent = "Connect";
  document.getElementById("gate").style.display = "block";

  clearStaged();
}

function registerEvents() {
  if (!window.ethereum) return;
  window.ethereum.on("accountsChanged", onAccounts);
  window.ethereum.on("chainChanged", onChain);
  window.ethereum.on("disconnect", onDisconnect);
}

function unregisterEvents() {
  if (!window.ethereum) return;
  window.ethereum.removeListener("accountsChanged", onAccounts);
  window.ethereum.removeListener("chainChanged", onChain);
  window.ethereum.removeListener("disconnect", onDisconnect);
}

async function onAccounts(accs) {
  if (!accs || !accs.length) { disconnect(); return; }
  if (accs[0].toLowerCase() !== (userAddress || "").toLowerCase()) {
    userAddress = accs[0];
    signer = await provider.getSigner();
    document.getElementById("addr").textContent = userAddress.slice(0, 6) + "..." + userAddress.slice(-4);
    await refreshBalance();
  }
}

async function onChain() {
  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();
  tokenContract = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, provider);
  await checkNetwork();
  await refreshBalance();
}

function onDisconnect() { disconnect(); }

// --- expose ---

window.connectWallet = connectWallet;
window.clearStaged = clearStaged;
window.applyStaged = applyStaged;

// --- init ---

window.addEventListener("load", async function() {
  canvas = document.getElementById("pixelCanvas");
  ctx = canvas.getContext("2d");

  initGrid();
  loadState();
  drawGrid();
  renderStats();
  updateStagedUI();

  canvas.addEventListener("click", onCanvasClick);
  canvas.addEventListener("touchstart", onCanvasClick, { passive: false });

  if (window.ethereum) {
    try {
      var accs = await window.ethereum.request({ method: "eth_accounts" });
      if (accs && accs.length) await connectWallet();
    } catch (e) {}
  }
});
