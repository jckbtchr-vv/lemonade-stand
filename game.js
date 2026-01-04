// Lemonade Stand – progression simulation gated by LEMON balance on Base
// Token address (Base): 0xd2969cc475a49e73182ae1c517add57db0f1c2ac

// --- Config -----------------------------------------------------------------

const BASE_CHAIN_ID = 8453n;
const TOKEN_ADDRESS = "0xd2969cc475a49e73182ae1c517add57db0f1c2ac";
const REQUIRED_BALANCE = 1000;

// Minimal ERC-20 ABI
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
let lastBalance = 0;
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
  
  // Base variables (modified by upgrades)
  pricePerCup: 0.50,
  costPerCup: 0.20,
  opsMultiplier: 1.0,
  
  lastShiftAt: 0,
  plHistory: [],
  
  // Market events (rare temporary mods)
  activeEvent: null, // { name, type, multiplier, duration }
  eventTurnsRemaining: 0
};

const weatherState = {
  condition: "UNKNOWN",
  temperature: null,
  demandLabel: "WAITING",
  demandMultiplier: 1.0
};

// --- Upgrades Data ----------------------------------------------------------

const upgrades = [
  // TIER 0
  {
    id: "nicerCups",
    tier: 0,
    name: "Nicer Cups",
    desc: "Thicker paper, better feel. Customers pay more.",
    cost: 15,
    effect: (s) => { s.pricePerCup += 0.05; },
    owned: false
  },
  {
    id: "iceCooler",
    tier: 0,
    name: "Ice Cooler",
    desc: "Cold drinks sell faster in the heat.",
    cost: 30,
    effect: (s) => { s.hype += 0.1; },
    owned: false
  },
  {
    id: "hireNeighbor",
    tier: 0,
    name: "Hire Neighbor Kid",
    desc: "Two hands are better than one.",
    cost: 50,
    effect: (s) => { s.opsMultiplier += 0.2; },
    owned: false
  },
  {
    id: "businessLicense",
    tier: 0,
    name: "Business License",
    desc: "Official paperwork. Unlock next tier.",
    cost: 100,
    effect: (s) => { s.tierIndex = 1; },
    owned: false,
    isTierUnlock: true
  },
  // TIER 1
  {
    id: "freshLemons",
    tier: 1,
    name: "Fresh Lemons Contract",
    desc: "Direct from the farm. Better taste, lower cost.",
    cost: 150,
    effect: (s) => { s.pricePerCup += 0.10; s.costPerCup -= 0.02; },
    owned: false
  },
  {
    id: "instagram",
    tier: 1,
    name: "Instagram Page",
    desc: "Digital footprint drives local hype.",
    cost: 300,
    effect: (s) => { s.hype += 0.3; },
    owned: false
  },
  {
    id: "secondStand",
    tier: 1,
    name: "Second Stand",
    desc: "Expand operations to the next block.",
    cost: 500,
    effect: (s) => { s.opsMultiplier += 0.5; },
    owned: false
  },
  {
    id: "franchisePapers",
    tier: 1,
    name: "Franchise Papers",
    desc: "Legal framework for expansion. Unlock next tier.",
    cost: 2000,
    effect: (s) => { s.tierIndex = 2; },
    owned: false,
    isTierUnlock: true
  },
  // TIER 2
  {
    id: "managerTraining",
    tier: 2,
    name: "Manager Training",
    desc: "Standardized service across locations.",
    cost: 1000,
    effect: (s) => { s.opsMultiplier += 0.5; },
    owned: false
  },
  {
    id: "centralKitchen",
    tier: 2,
    name: "Central Kitchen",
    desc: "Mass production efficiency.",
    cost: 2500,
    effect: (s) => { s.costPerCup -= 0.05; },
    owned: false
  },
  {
    id: "radioAds",
    tier: 2,
    name: "Radio Ads",
    desc: "Reach customers who don't even like lemonade.",
    cost: 5000,
    effect: (s) => { s.hype += 0.5; },
    owned: false
  },
  {
    id: "ipoPrep",
    tier: 2,
    name: "IPO Preparation",
    desc: "Go public. Unlock next tier.",
    cost: 10000,
    effect: (s) => { s.tierIndex = 3; },
    owned: false,
    isTierUnlock: true
  },
  // TIER 3
  {
    id: "celebrity",
    tier: 3,
    name: "Celebrity Endorsement",
    desc: "The face of the brand.",
    cost: 25000,
    effect: (s) => { s.hype += 1.0; },
    owned: false
  },
  {
    id: "verticalIntegration",
    tier: 3,
    name: "Vertical Integration",
    desc: "Own the farms, own the trucks.",
    cost: 50000,
    effect: (s) => { s.costPerCup -= 0.08; },
    owned: false
  },
  {
    id: "kiosks",
    tier: 3,
    name: "Automated Kiosks",
    desc: "Robots don't sleep.",
    cost: 100000,
    effect: (s) => { s.opsMultiplier += 2.0; },
    owned: false
  },
  {
    id: "globalExpansion",
    tier: 3,
    name: "Global Expansion",
    desc: "Unlock the final tier.",
    cost: 250000,
    effect: (s) => { s.tierIndex = 4; },
    owned: false,
    isTierUnlock: true
  }
];

// --- Market Events ----------------------------------------------------------

const MARKET_EVENTS = [
  { name: "Viral TikTok", type: "DEMAND", mult: 1.5, turns: 3, desc: "A teen influencer rated your stand 10/10." },
  { name: "Competitor", type: "DEMAND", mult: 0.7, turns: 3, desc: "A rival stand opened across the street." },
  { name: "Lemon Shortage", type: "COST", mult: 1.5, turns: 2, desc: "Supply chain issues spiked lemon prices." },
  { name: "Heatwave", type: "DEMAND", mult: 1.8, turns: 1, desc: "Record temps driving massive thirst." },
  { name: "Health Inspection", type: "OPS", mult: 0.5, turns: 2, desc: "The inspector is slowing everything down." }
];

function rollMarketEvent() {
  if (gameState.activeEvent || Math.random() > 0.15) return null; // 15% chance
  const evt = MARKET_EVENTS[Math.floor(Math.random() * MARKET_EVENTS.length)];
  gameState.activeEvent = evt;
  gameState.eventTurnsRemaining = evt.turns;
  return evt;
}

// --- Game Logic -------------------------------------------------------------

function updateGameDisplay() {
  const cashEl = document.getElementById("cash");
  const cupsEl = document.getElementById("cups");
  const runButton = document.getElementById("runButton");
  const tierTitle = document.getElementById("tierTitle");
  
  if (cashEl) cashEl.textContent = formatUsd(gameState.cash);
  if (cupsEl) cupsEl.textContent = gameState.cups.toLocaleString();
  
  // Variables Grid
  const varPrice = document.getElementById("varPrice");
  const varCost = document.getElementById("varCost");
  const varOps = document.getElementById("varOps");
  const varHype = document.getElementById("varHype");
  
  if (varPrice) varPrice.textContent = formatUsd(gameState.pricePerCup);
  if (varCost) varCost.textContent = formatUsd(gameState.costPerCup);
  if (varOps) varOps.textContent = `${gameState.opsMultiplier.toFixed(1)}x`;
  if (varHype) varHype.textContent = `${gameState.hype.toFixed(1)}x`;

  const revEl = document.getElementById("totalRevenue");
  const costEl = document.getElementById("totalCost");
  if (revEl) revEl.textContent = formatUsd(gameState.totalRevenue);
  if (costEl) costEl.textContent = formatUsd(gameState.totalCost);

  if (tierTitle) tierTitle.textContent = TIERS[gameState.tierIndex];

  if (runButton) {
    runButton.disabled = !isEligible;
    runButton.textContent = isEligible ? "Run Stand" : "Run Stand";
  }

  fetchTokenPrice();
  updateCooldownUI();
  renderUpgrades();
}

function runStand() {
  if (!isEligible) return;

  const now = Date.now();
  if (now < gameState.lastShiftAt + SHIFT_COOLDOWN_MS) return;
  gameState.lastShiftAt = now;

  gameState.shifts += 1;
  updateWeather();

  // Handle Event Decay
  let eventMultiplier = 1.0;
  let eventCostMult = 1.0;
  let eventOpsMult = 1.0;
  let currentEvent = gameState.activeEvent;

  if (currentEvent) {
    if (currentEvent.type === "DEMAND") eventMultiplier = currentEvent.mult;
    if (currentEvent.type === "COST") eventCostMult = currentEvent.mult;
    if (currentEvent.type === "OPS") eventOpsMult = currentEvent.mult;
    
    gameState.eventTurnsRemaining--;
    if (gameState.eventTurnsRemaining <= 0) {
      gameState.activeEvent = null;
    }
  }

  // Calc output
  const base = 5 + Math.floor(gameState.shifts / 10);
  const hypeBonus = Math.floor(gameState.hype * 2);
  
  let cups = Math.round(
    (base + hypeBonus) * 
    weatherState.demandMultiplier * 
    gameState.opsMultiplier *
    eventOpsMult *
    eventMultiplier
  );
  cups = Math.max(1, cups);

  const revenue = cups * gameState.pricePerCup;
  const cost = cups * gameState.costPerCup * eventCostMult;
  const profit = revenue - cost;

  gameState.cups += cups;
  gameState.cash += profit;
  gameState.totalRevenue += revenue;
  gameState.totalCost += cost;
  
  gameState.hype += (cups / 1000); 

  gameState.plHistory.push(gameState.cash);
  if (gameState.plHistory.length > 50) gameState.plHistory.shift();

  // Post-shift logic
  const newEvent = rollMarketEvent(); // Try to spawn new event if slot open

  updateGameDisplay();
  drawPlChart();
}

// --- Weather ----------------------------------------------------------------

function updateWeather() {
  const r = Math.random();
  if (r < 0.2) {
    weatherState.condition = "COLD";
    weatherState.demandMultiplier = 0.7;
    weatherState.demandLabel = "LOW";
  } else if (r < 0.5) {
    weatherState.condition = "MILD";
    weatherState.demandMultiplier = 1.0;
    weatherState.demandLabel = "NORMAL";
  } else if (r < 0.8) {
    weatherState.condition = "HOT";
    weatherState.demandMultiplier = 1.4;
    weatherState.demandLabel = "HIGH";
  } else {
    weatherState.condition = "HEATWAVE";
    weatherState.demandMultiplier = 1.8;
    weatherState.demandLabel = "INSANE";
  }

  const el = document.getElementById("weatherText");
  if (el) {
    el.textContent = `Weather: ${weatherState.condition} · Demand: ${weatherState.demandLabel}`;
  }
}

// --- Upgrades UI ------------------------------------------------------------

function renderUpgrades() {
  const listEl = document.getElementById("upgradesList");
  if (!listEl) return;

  if (!isEligible) {
    listEl.innerHTML = '<div class="muted">Connect wallet to see operations.</div>';
    return;
  }

  const currentTierUpgrades = upgrades.filter(
    u => u.tier === gameState.tierIndex && !u.owned
  );

  if (currentTierUpgrades.length === 0) {
    if (gameState.tierIndex === TIERS.length - 1) {
      listEl.innerHTML = '<div class="muted">You have reached the pinnacle of lemonade capitalism.</div>';
    } else {
      listEl.innerHTML = '<div class="muted">No operations available.</div>';
    }
    return;
  }

  listEl.innerHTML = currentTierUpgrades.map(u => {
    const affordable = gameState.cash >= u.cost;
    const btnClass = affordable ? "primary" : "";
    const disabled = affordable ? "" : "disabled";
    
    return `
      <div class="upgrade-item">
        <div class="upgrade-header">
          <span class="upgrade-name">${u.name}</span>
          <span class="upgrade-name">${formatUsd(u.cost)}</span>
        </div>
        <div class="upgrade-desc">${u.desc}</div>
        <button class="${btnClass}" ${disabled} onclick="buyUpgrade('${u.id}')" style="width:100%">
          ${affordable ? "BUY" : "NEED CASH"}
        </button>
      </div>
    `;
  }).join("");
}

function buyUpgrade(id) {
  const u = upgrades.find(x => x.id === id);
  if (!u || u.owned || gameState.cash < u.cost) return;

  gameState.cash -= u.cost;
  u.owned = true;
  u.effect(gameState);

  updateGameDisplay();
}

window.buyUpgrade = buyUpgrade;
window.runStand = runStand;

// --- Chart ------------------------------------------------------------------

function drawPlChart() {
  const canvas = document.getElementById("plChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width = canvas.clientWidth;
  const h = canvas.height = canvas.clientHeight;

  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, w, h);

  const data = gameState.plHistory;
  if (data.length < 2) return;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  ctx.beginPath();
  ctx.strokeStyle = "#00ff00";
  ctx.lineWidth = 2;

  data.forEach((val, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((val - min) / range) * (h - 20) - 10;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

// --- Cooldown ---------------------------------------------------------------

function updateCooldownUI() {
  const msgEl = document.getElementById("cooldownMessage");
  const btn = document.getElementById("runButton");
  if (!msgEl || !btn) return;

  if (!isEligible) {
    msgEl.textContent = "";
    return;
  }

  const now = Date.now();
  const rem = gameState.lastShiftAt + SHIFT_COOLDOWN_MS - now;

  if (rem <= 0) {
    msgEl.textContent = "Ready.";
    btn.disabled = false;
  } else {
    msgEl.textContent = `Wait ${(rem/1000).toFixed(1)}s`;
    btn.disabled = true;
  }
}

setInterval(updateCooldownUI, 100);

// --- Wallet -----------------------------------------------------------------

async function connectWallet() {
  if (!window.ethereum) return alert("No wallet found");
  provider = new ethers.BrowserProvider(window.ethereum);
  const accounts = await provider.send("eth_requestAccounts", []);
  if (!accounts.length) return;
  
  signer = await provider.getSigner();
  userAddress = await signer.getAddress();
  
  document.getElementById("walletAddress").textContent = shortenAddress(userAddress);
  document.getElementById("connectWalletButton").textContent = "Connected";
  document.getElementById("connectWalletButton").disabled = true;

  updateNetwork();
  updateBalance();
}

async function updateNetwork() {
  if (!provider) return;
  const net = await provider.getNetwork();
  const isBase = net.chainId === BASE_CHAIN_ID;
  document.getElementById("networkWarning").style.display = isBase ? "none" : "block";
  checkEligibility(lastBalance, isBase);
}

async function updateBalance() {
  if (!provider || !userAddress) return;
  const contract = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, provider);
  const bal = await contract.balanceOf(userAddress);
  const human = Number(ethers.formatUnits(bal, 18));
  lastBalance = human;
  document.getElementById("tokenBalance").textContent = human.toFixed(2);
  
  const net = await provider.getNetwork();
  checkEligibility(human, net.chainId === BASE_CHAIN_ID);
}

function checkEligibility(bal, isBase) {
  isEligible = (isBase && bal >= REQUIRED_BALANCE);
  
  const gateEl = document.getElementById("gateMessage");
  if (gateEl) {
    if (isEligible) gateEl.style.display = "none";
    else gateEl.style.display = "block";
  }
  
  updateGameDisplay();
}

let lastPriceFetch = 0;
async function fetchTokenPrice() {
  const now = Date.now();
  if (now - lastPriceFetch < 60000) return; // cache for 1 min
  lastPriceFetch = now;

  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${TOKEN_ADDRESS}`);
    const data = await res.json();
    if (data.pairs && data.pairs[0]) {
      const priceUsd = parseFloat(data.pairs[0].priceUsd);
      const costFor1k = priceUsd * 1000;
      const el = document.getElementById("costToPlay");
      if (el) el.textContent = formatUsd(costFor1k);
    }
  } catch (e) {
    console.error("Price fetch failed", e);
  }
}

window.connectWallet = connectWallet;

// --- Helpers ----------------------------------------------------------------

function formatUsd(n) {
  return (n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(2);
}

function shortenAddress(a) {
  return a.slice(0,6) + "..." + a.slice(-4);
}

window.addEventListener("load", () => {
  if (window.ethereum && window.ethereum.selectedAddress) {
    connectWallet();
  }
  updateGameDisplay();
});
