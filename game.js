// Lemonade Stand – progression simulation gated by LEMON balance on Base
// Token address (Base): 0xd2969cc475a49e73182ae1c517add57db0f1c2ac

// --- Config -----------------------------------------------------------------

const BASE_CHAIN_ID = 8453n;
const TOKEN_ADDRESS = "0xd2969cc475a49e73182ae1c517add57db0f1c2ac";
const REQUIRED_BALANCE = 1000; // minimum LEMON required to play (in whole tokens)

// Minimal ERC-20 ABI for balance + metadata
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

// --- Wallet / token state ---------------------------------------------------

let provider = null;
let signer = null;
let userAddress = null;

let tokenDecimals = 18;
let tokenSymbol = "LEMON";

let lastChainId = null;
let lastBalance = 0; // in whole-token units
let isEligible = false;

// --- Game state -------------------------------------------------------------

const TIERS = [
  "Street Stand",
  "Local Favorite",
  "Regional Chain",
  "National Brand",
  "Global Conglomerate"
];

const SHIFT_COOLDOWN_MS = 3000;

const gameState = {
  shifts: 0,
  cups: 0,
  customers: 0,
  hype: 1.0,
  cash: 0,
  totalRevenue: 0,
  totalCost: 0,
  tierIndex: 0,
  pricePerCup: 0.5,
  costPerCup: 0.2,
  opsMultiplier: 1.0,
  lastShiftAt: 0,
  plHistory: [] // array of cumulative cash values
};

const weatherState = {
  condition: "UNKNOWN",
  temperature: null,
  demandLabel: "WAITING",
  demandMultiplier: 1.0
};

// --- Game logic -------------------------------------------------------------

function updateGameDisplay() {
  const shiftsEl = document.getElementById("shifts");
  const cupsEl = document.getElementById("cups");
  const customersEl = document.getElementById("customers");
  const hypeEl = document.getElementById("hype");
  const cashEl = document.getElementById("cash");
  const tierEl = document.getElementById("tier");
  const totalRevEl = document.getElementById("totalRevenue");
  const totalCostEl = document.getElementById("totalCost");
  const totalProfitEl = document.getElementById("totalProfit");
  const runButton = document.getElementById("runButton");

  if (shiftsEl) shiftsEl.textContent = gameState.shifts.toString();
  if (cupsEl) cupsEl.textContent = gameState.cups.toString();
  if (customersEl) customersEl.textContent = gameState.customers.toString();
  if (hypeEl) hypeEl.textContent = `${gameState.hype.toFixed(1)}x`;
  if (cashEl) cashEl.textContent = formatUsd(gameState.cash);
  if (tierEl) tierEl.textContent = TIERS[gameState.tierIndex] || TIERS[0];
  if (totalRevEl) totalRevEl.textContent = formatUsd(gameState.totalRevenue);
  if (totalCostEl) totalCostEl.textContent = formatUsd(gameState.totalCost);
  if (totalProfitEl) totalProfitEl.textContent = formatUsd(gameState.cash);

  updateCooldownUI();
}

function runStand() {
  if (!isEligible) return;

  const now = Date.now();
  if (now < gameState.lastShiftAt + SHIFT_COOLDOWN_MS) {
    return;
  }
  gameState.lastShiftAt = now;

  gameState.shifts += 1;

  // Update weather and demand for this shift
  updateWeather();

  // Base cups per shift grows with tier and shifts
  const baseCupsPerShift = 5 + gameState.tierIndex * 3 + Math.floor(gameState.shifts / 5);
  const hypeBoost = Math.floor(gameState.hype);
  let cupsThisShift = Math.max(
    1,
    Math.round(
      (baseCupsPerShift + hypeBoost) * weatherState.demandMultiplier * gameState.opsMultiplier
    )
  );

  const customersThisShift = cupsThisShift + 2;

  // Revenue and cost
  const revenue = cupsThisShift * gameState.pricePerCup;
  const cost = cupsThisShift * gameState.costPerCup;
  const profit = revenue - cost;

  gameState.cups += cupsThisShift;
  gameState.customers += customersThisShift;
  gameState.totalRevenue += revenue;
  gameState.totalCost += cost;
  gameState.cash += profit;

  // Hype slowly grows with total cups, but with diminishing returns
  gameState.hype = 1 + Math.log10(1 + gameState.cups) / 2;

  // Record P&L history for chart
  gameState.plHistory.push(gameState.cash);
  if (gameState.plHistory.length > 100) {
    gameState.plHistory = gameState.plHistory.slice(-100);
  }

  maybeUnlockTier();
  updateGameDisplay();
  drawPlChart();
  renderUpgrades();
}

window.runStand = runStand;

// --- Weather system ---------------------------------------------------------

function updateWeather() {
  const r = Math.random();
  if (r < 0.15) {
    weatherState.condition = "COLD";
    weatherState.temperature = 8 + Math.floor(Math.random() * 5);
    weatherState.demandLabel = "LOW";
    weatherState.demandMultiplier = 0.6;
  } else if (r < 0.4) {
    weatherState.condition = "MILD";
    weatherState.temperature = 18 + Math.floor(Math.random() * 5);
    weatherState.demandLabel = "NORMAL";
    weatherState.demandMultiplier = 1.0;
  } else if (r < 0.75) {
    weatherState.condition = "HOT";
    weatherState.temperature = 26 + Math.floor(Math.random() * 6);
    weatherState.demandLabel = "HIGH";
    weatherState.demandMultiplier = 1.4;
  } else if (r < 0.9) {
    weatherState.condition = "RAIN";
    weatherState.temperature = 14 + Math.floor(Math.random() * 6);
    weatherState.demandLabel = "LOW";
    weatherState.demandMultiplier = 0.7;
  } else {
    weatherState.condition = "HEATWAVE";
    weatherState.temperature = 32 + Math.floor(Math.random() * 5);
    weatherState.demandLabel = "INSANE";
    weatherState.demandMultiplier = 1.8;
  }

  const textEl = document.getElementById("weatherText");
  if (textEl) {
    if (weatherState.temperature == null) {
      textEl.textContent = "Weather: unknown · Demand: waiting for first shift.";
    } else {
      textEl.textContent = `Weather: ${weatherState.condition} ${weatherState.temperature}°C · Demand: ${weatherState.demandLabel}`;
    }
  }
}

// --- Upgrades ---------------------------------------------------------------

const upgrades = [
  {
    id: "localFavorite",
    name: "Local Favorite",
    description: "Word of mouth kicks in. Slightly better pricing and hype.",
    cost: 100,
    requiredTier: 0,
    newTier: 1,
    priceBoost: 0.1,
    opsBoost: 0.0,
    hypeBoost: 0.2,
    owned: false
  },
  {
    id: "regionalChain",
    name: "Regional Chain",
    description: "Multiple stands, better operations. More cups per shift.",
    cost: 500,
    requiredTier: 1,
    newTier: 2,
    priceBoost: 0.0,
    opsBoost: 0.3,
    hypeBoost: 0.2,
    owned: false
  },
  {
    id: "nationalBrand",
    name: "National Brand",
    description: "Serious brand equity. Higher prices and stable demand.",
    cost: 2000,
    requiredTier: 2,
    newTier: 3,
    priceBoost: 0.2,
    opsBoost: 0.2,
    hypeBoost: 0.3,
    owned: false
  },
  {
    id: "globalConglomerate",
    name: "Global Conglomerate",
    description: "Everywhere at once. Massive scale and hype.",
    cost: 10000,
    requiredTier: 3,
    newTier: 4,
    priceBoost: 0.25,
    opsBoost: 0.5,
    hypeBoost: 0.5,
    owned: false
  }
];

function renderUpgrades() {
  const listEl = document.getElementById("upgradesList");
  if (!listEl) return;

  const parts = upgrades
    .map((u) => {
      const canSee = gameState.tierIndex >= u.requiredTier;
      if (!canSee) return "";

      const affordable = gameState.cash >= u.cost;
      const lockedByTier = gameState.tierIndex !== u.requiredTier;
      const canBuy = affordable && !u.owned && !lockedByTier;

      let status = "";
      if (u.owned) status = "OWNED";
      else if (!affordable) status = "Need more cash";
      else if (lockedByTier) status = "Unlock previous tier first";
      else status = "Available";

      const buttonLabel = u.owned ? "OWNED" : `Buy for ${formatUsd(u.cost)}`;
      const disabledAttr = canBuy ? "" : "disabled";

      return `
      <div class="stat" style="margin-bottom: 8px;">
        <span class="stat-value">${u.name}</span>
        <span class="stat-label">${u.description}</span>
        <div style="margin-top: 6px; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
          <span class="muted">${status}</span>
          <button ${disabledAttr} onclick="buyUpgrade('${u.id}')">${buttonLabel}</button>
        </div>
      </div>
    `;
    })
    .filter(Boolean);

  if (!parts.length) {
    listEl.innerHTML = '<p class="muted">Run the stand to unlock upgrades.</p>';
  } else {
    listEl.innerHTML = parts.join("");
  }
}

function buyUpgrade(id) {
  const u = upgrades.find((x) => x.id === id);
  if (!u || u.owned) return;

  const affordable = gameState.cash >= u.cost;
  const correctTier = gameState.tierIndex === u.requiredTier;
  if (!affordable || !correctTier) return;

  gameState.cash -= u.cost;
  gameState.pricePerCup += u.priceBoost;
  gameState.opsMultiplier += u.opsBoost;
  gameState.hype += u.hypeBoost;
  gameState.tierIndex = u.newTier;
  u.owned = true;

  updateGameDisplay();
  renderUpgrades();
}

function maybeUnlockTier() {
  // Explicit upgrades currently control tiers; passive unlocks could be added here.
}

// --- P&L chart --------------------------------------------------------------

function drawPlChart() {
  const canvas = document.getElementById("plChart");
  const statusEl = document.getElementById("plChartStatus");
  if (!canvas) return;

  const history = gameState.plHistory;
  if (!history.length) {
    if (statusEl) statusEl.textContent = "Run a few shifts to see the curve.";
    const ctx0 = canvas.getContext("2d");
    ctx0.fillStyle = "#111";
    ctx0.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const ctx = canvas.getContext("2d");
  const width = (canvas.width = canvas.clientWidth || 320);
  const height = (canvas.height = 140);

  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, width, height);

  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;

  const padding = 10;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;

  ctx.strokeStyle = "#333";
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 3; i++) {
    const y = padding + (chartH / 3) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "#00ff00";
  ctx.lineWidth = 1.5;
  ctx.beginPath();

  history.forEach((value, idx) => {
    const x = padding + (idx / (history.length - 1 || 1)) * chartW;
    const y = padding + (1 - (value - min) / range) * chartH;
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();

  if (statusEl) statusEl.textContent = "";
}

// --- Cooldown ---------------------------------------------------------------

function updateCooldownUI() {
  const msgEl = document.getElementById("cooldownMessage");
  const runButton = document.getElementById("runButton");
  if (!msgEl || !runButton) return;

  if (!isEligible) {
    msgEl.textContent = "Connect an eligible wallet to run the stand.";
    runButton.disabled = true;
    return;
  }

  const now = Date.now();
  const remaining = gameState.lastShiftAt + SHIFT_COOLDOWN_MS - now;

  if (remaining <= 0) {
    msgEl.textContent = "Shift ready. Click Run Stand.";
    runButton.disabled = false;
  } else {
    const secs = (remaining / 1000).toFixed(1);
    msgEl.textContent = `Next shift in ${secs}s`;
    runButton.disabled = true;
  }
}

setInterval(updateCooldownUI, 200);

// --- Wallet + token balance (read-only) ------------------------------------

async function connectWallet() {
  try {
    if (!window.ethereum) {
      alert("No Ethereum provider found. Please install MetaMask or a compatible wallet.");
      return;
    }

    provider = new ethers.BrowserProvider(window.ethereum);

    const accounts = await provider.send("eth_requestAccounts", []);
    if (!accounts || accounts.length === 0) return;

    signer = await provider.getSigner();
    userAddress = await signer.getAddress();

    const addrEl = document.getElementById("walletAddress");
    if (addrEl) {
      addrEl.textContent = shortenAddress(userAddress);
    }

    await updateNetworkInfo();
    await loadTokenMetadataAndBalance();

    const btn = document.getElementById("connectWalletButton");
    if (btn) {
      btn.textContent = "Wallet Connected";
      btn.disabled = true;
    }
  } catch (err) {
    console.error("connectWallet error", err);
    alert("Failed to connect wallet. Check the console for details.");
  }
}

window.connectWallet = connectWallet;

async function updateNetworkInfo() {
  if (!provider) return;

  try {
    const network = await provider.getNetwork();
    lastChainId = network.chainId;

    const nameEl = document.getElementById("networkName");
    const warningEl = document.getElementById("networkWarning");

    if (nameEl) {
      nameEl.textContent = `chainId: ${lastChainId.toString()}`;
    }

    const onBase = lastChainId === BASE_CHAIN_ID;
    if (warningEl) {
      warningEl.style.display = onBase ? "none" : "block";
    }

    evaluateEligibility();
  } catch (err) {
    console.error("updateNetworkInfo error", err);
  }
}

async function loadTokenMetadataAndBalance() {
  if (!provider || !userAddress) return;

  try {
    const token = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, provider);

    const [rawBalance, decimals, symbol] = await Promise.all([
      token.balanceOf(userAddress),
      token.decimals(),
      token.symbol()
    ]);

    tokenDecimals = Number(decimals);
    tokenSymbol = symbol || tokenSymbol;

    const humanBalance = Number(ethers.formatUnits(rawBalance, tokenDecimals));
    lastBalance = humanBalance;

    const balanceEl = document.getElementById("tokenBalance");
    if (balanceEl) {
      balanceEl.textContent = `${humanBalance.toFixed(2)} ${tokenSymbol}`;
    }

    evaluateEligibility();
  } catch (err) {
    console.error("loadTokenMetadataAndBalance error", err);
    const balanceEl = document.getElementById("tokenBalance");
    if (balanceEl) {
      balanceEl.textContent = "Error loading balance";
    }
  }
}

// --- Eligibility gate -------------------------------------------------------

function evaluateEligibility() {
  const gateEl = document.getElementById("gateMessage");
  const statusEl = document.getElementById("eligibilityStatus");

  let message = "";
  let status = "";
  let eligible = false;

  if (!userAddress) {
    message = "Connect a wallet holding at least 1,000 LEMON on Base to begin.";
    status = "Wallet not connected.";
  } else if (lastChainId !== BASE_CHAIN_ID) {
    message = "Switch your wallet to the Base network (chainId 8453) to play.";
    status = "Wrong network.";
  } else if (!isFinite(lastBalance)) {
    message = "Unable to read your LEMON balance yet.";
    status = "Reading balance…";
  } else if (lastBalance < REQUIRED_BALANCE) {
    const needed = REQUIRED_BALANCE.toLocaleString();
    const have = Math.floor(lastBalance).toLocaleString();
    message = `You need at least ${needed} ${tokenSymbol} to play. Current: ${have}.`;
    status = "Balance below requirement.";
  } else {
    eligible = true;
    const have = Math.floor(lastBalance).toLocaleString();
    message = `Requirement met – you hold ${have} ${tokenSymbol} on Base. Run the stand as much as you like.`;
    status = "Eligible to play.";
  }

  isEligible = eligible;

  if (gateEl) gateEl.textContent = message;
  if (statusEl) statusEl.textContent = status;

  updateGameDisplay();
}

// --- Helpers ----------------------------------------------------------------

function shortenAddress(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function formatUsd(value) {
  if (!isFinite(value)) return "$0.00";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return sign + "$" + abs.toFixed(2);
}

// --- Init -------------------------------------------------------------------

window.addEventListener("load", () => {
  updateGameDisplay();
  renderUpgrades();

  // If wallet is already connected (MetaMask "connected site"), try to attach
  if (window.ethereum && window.ethereum.selectedAddress) {
    connectWallet().catch((e) =>
      console.warn("Auto-connect failed:", e)
    );
  }
});
