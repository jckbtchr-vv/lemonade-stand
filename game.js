// Lemonade Stand – Simplified with Token Burning
// Token address (Base): 0xd2969cc475a49e73182ae1c517add57db0f1c2ac

// --- Config -----------------------------------------------------------------

const BASE_CHAIN_ID = 8453n;
const TOKEN_ADDRESS = "0xd2969cc475a49e73182ae1c517add57db0f1c2ac";
const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const REQUIRED_BALANCE = 1000;
const SHIFT_COOLDOWN_MS = 3000;

// ERC-20 ABI with transfer function
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)"
];

// --- Wallet / token state ---------------------------------------------------

let provider = null;
let signer = null;
let userAddress = null;
let tokenDecimals = 18;
let tokenSymbol = "LEMON";
let lastBalance = 0;
let isEligible = false;

// --- Game Phases ------------------------------------------------------------

const PHASES = {
  STREET: 0,
  EMPIRE: 1,
  CORPORATE: 2,
  SINGULARITY: 3
};

const PHASE_NAMES = [
  "Street Stand",
  "Lemon Empire",
  "LemonCorp™",
  "The Lemon Singularity"
];

// --- Game State -------------------------------------------------------------

const gameState = {
  shifts: 0,
  cups: 0,
  totalCupsEver: 0,
  hype: 1.0,
  cash: 10.00,
  totalRevenue: 0,
  totalCost: 0,
  phase: PHASES.STREET,

  // Inventory
  inventory: {
    lemons: 0,
    sugar: 0,
    ice: 0,
    cups: 0
  },

  // Base variables (modified by upgrades)
  pricePerCup: 0.50,
  opsMultiplier: 1.0,

  lastShiftAt: 0,

  // Market events
  activeEvent: null,
  eventTurnsRemaining: 0,

  // Simple automation
  autoMode: false,
  autoShiftInterval: null,

  // Narrative
  shownNarratives: []
};

const weatherState = {
  condition: "UNKNOWN",
  demandLabel: "WAITING",
  demandMultiplier: 1.0
};

// Ingredient costs (Cash)
const INGREDIENT_COSTS = {
  lemons: 0.50,
  sugar: 0.20,
  ice: 0.10,
  cups: 0.10
};

// Consumption per shift
const CONSUMPTION = {
  lemons: 5,
  sugar: 2,
  ice: 5,
  cups: 5
};

// --- Upgrades Data (costs in LEMON tokens) ---------------------------------

const upgrades = [
  // PHASE 0: Street Stand (10 LEMON - 1,000 LEMON)
  {
    id: "nicerCups",
    phase: 0,
    name: "Nicer Cups",
    desc: "Thicker paper, better feel. +$0.10 per cup.",
    cost: 100,
    effect: (s) => { s.pricePerCup += 0.10; },
    owned: false
  },
  {
    id: "iceCooler",
    phase: 0,
    name: "Ice Cooler",
    desc: "Cold drinks sell faster. +0.2 hype.",
    cost: 250,
    effect: (s) => { s.hype += 0.2; },
    owned: false
  },
  {
    id: "hireHelper",
    phase: 0,
    name: "Hire Helper",
    desc: "Two hands are better than one. +0.3x ops.",
    cost: 500,
    effect: (s) => { s.opsMultiplier += 0.3; },
    owned: false
  },
  {
    id: "betterLemons",
    phase: 0,
    name: "Premium Lemons",
    desc: "Fresh from the farm. +$0.15 per cup.",
    cost: 1000,
    effect: (s) => { s.pricePerCup += 0.15; },
    owned: false
  },
  {
    id: "socialMedia",
    phase: 0,
    name: "Social Media",
    desc: "Instagram brings the crowds. +0.5 hype.",
    cost: 2000,
    effect: (s) => { s.hype += 0.5; },
    owned: false
  },
  {
    id: "unlockEmpire",
    phase: 0,
    name: "Expand to Empire",
    desc: "Open your second stand. Unlock Phase 2.",
    cost: 5000,
    effect: (s) => {
      s.phase = PHASES.EMPIRE;
      showNarrative("PHASE_2");
    },
    owned: false,
    isPhaseUnlock: true
  },

  // PHASE 1: Lemon Empire (10K - 100K LEMON)
  {
    id: "franchiseLicense",
    phase: 1,
    name: "Franchise License",
    desc: "Legal framework for expansion. +0.5x ops.",
    cost: 10000,
    effect: (s) => { s.opsMultiplier += 0.5; },
    owned: false
  },
  {
    id: "marketingCampaign",
    phase: 1,
    name: "Marketing Campaign",
    desc: "Billboards and radio ads. +1.0 hype.",
    cost: 20000,
    effect: (s) => { s.hype += 1.0; },
    owned: false
  },
  {
    id: "centralKitchen",
    phase: 1,
    name: "Central Kitchen",
    desc: "Mass production efficiency. +0.7x ops.",
    cost: 35000,
    effect: (s) => { s.opsMultiplier += 0.7; },
    owned: false
  },
  {
    id: "autoWorker",
    phase: 1,
    name: "Auto-Worker",
    desc: "Automate shift operations. Runs every 3 seconds.",
    cost: 50000,
    effect: (s) => {
      s.autoMode = true;
      startAutoShifts();
      showNarrative("AUTOMATION");
    },
    owned: false
  },
  {
    id: "qualityControl",
    phase: 1,
    name: "Quality Control",
    desc: "Consistent excellence. +$0.25 per cup.",
    cost: 75000,
    effect: (s) => { s.pricePerCup += 0.25; },
    owned: false
  },
  {
    id: "unlockCorp",
    phase: 1,
    name: "Go Corporate",
    desc: "Prepare for IPO. Unlock Phase 3.",
    cost: 100000,
    effect: (s) => {
      s.phase = PHASES.CORPORATE;
      showNarrative("PHASE_3");
    },
    owned: false,
    isPhaseUnlock: true
  },

  // PHASE 2: LemonCorp (150K - 1M LEMON)
  {
    id: "celebrity",
    phase: 2,
    name: "Celebrity Endorsement",
    desc: "The face of the brand. +2.0 hype.",
    cost: 150000,
    effect: (s) => { s.hype += 2.0; },
    owned: false
  },
  {
    id: "verticalIntegration",
    phase: 2,
    name: "Vertical Integration",
    desc: "Own the entire supply chain. +1.0x ops.",
    cost: 250000,
    effect: (s) => { s.opsMultiplier += 1.0; },
    owned: false
  },
  {
    id: "roboticKiosks",
    phase: 2,
    name: "Robotic Kiosks",
    desc: "Robots don't sleep. +1.5x ops.",
    cost: 400000,
    effect: (s) => { s.opsMultiplier += 1.5; },
    owned: false
  },
  {
    id: "globalDistribution",
    phase: 2,
    name: "Global Distribution",
    desc: "Worldwide logistics network. +$0.50 per cup.",
    cost: 600000,
    effect: (s) => { s.pricePerCup += 0.50; },
    owned: false
  },
  {
    id: "premiumBrand",
    phase: 2,
    name: "Premium Brand",
    desc: "Luxury lemonade. +$0.75 per cup.",
    cost: 800000,
    effect: (s) => { s.pricePerCup += 0.75; },
    owned: false
  },
  {
    id: "unlockSingularity",
    phase: 2,
    name: "AI Research",
    desc: "Develop true lemon intelligence. Unlock Phase 4.",
    cost: 1000000,
    effect: (s) => {
      s.phase = PHASES.SINGULARITY;
      showNarrative("PHASE_4");
    },
    owned: false,
    isPhaseUnlock: true
  },

  // PHASE 3: Singularity (2M - 10M LEMON)
  {
    id: "aiOptimization",
    phase: 3,
    name: "AI Optimization",
    desc: "Machine learning perfects every variable. +3.0x ops.",
    cost: 2000000,
    effect: (s) => { s.opsMultiplier += 3.0; },
    owned: false
  },
  {
    id: "molecularEngineering",
    phase: 3,
    name: "Molecular Engineering",
    desc: "Design lemons at the atomic level. +$1.00 per cup.",
    cost: 4000000,
    effect: (s) => { s.pricePerCup += 1.00; },
    owned: false
  },
  {
    id: "quantumLemons",
    phase: 3,
    name: "Quantum Lemons",
    desc: "Exist in multiple states simultaneously. +5.0 hype.",
    cost: 7000000,
    effect: (s) => { s.hype += 5.0; },
    owned: false
  },
  {
    id: "universalLemonization",
    phase: 3,
    name: "Universal Lemonization",
    desc: "Convert all matter into lemons. The endgame.",
    cost: 10000000,
    effect: (s) => {
      showNarrative("ENDGAME");
    },
    owned: false
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
  if (gameState.activeEvent || Math.random() > 0.15) return null;
  const evt = MARKET_EVENTS[Math.floor(Math.random() * MARKET_EVENTS.length)];
  gameState.activeEvent = evt;
  gameState.eventTurnsRemaining = evt.turns;
  return evt;
}

// --- Narrative Messages -----------------------------------------------------

const NARRATIVES = {
  WELCOME: {
    title: "Welcome",
    messages: [
      "You squeeze your first lemon. The juice runs clear and sharp.",
      "A simple transaction: fruit becomes refreshment becomes profit.",
      "There's something satisfying about the efficiency of it all."
    ]
  },
  FIRST_HUNDRED: {
    title: "Milestone",
    messages: [
      "100 cups. The neighborhood knows your name now.",
      "You've earned their trust."
    ]
  },
  FIRST_THOUSAND: {
    title: "Growth",
    messages: [
      "1,000 cups. The stand isn't enough anymore.",
      "You dream of lemons. Endless yellow orchards stretching to the horizon."
    ]
  },
  AUTOMATION: {
    title: "Automation",
    messages: [
      "The machines work while you sleep.",
      "Is this freedom, or have you made yourself obsolete?"
    ]
  },
  PHASE_2: {
    title: "Empire",
    messages: [
      "PHASE 2: LEMON EMPIRE",
      "You've transcended the street corner.",
      "The algorithms whisper of expansion. Of optimization. Of more.",
      "The lemons must flow."
    ]
  },
  PHASE_3: {
    title: "Corporate",
    messages: [
      "PHASE 3: LEMONCORP™",
      "The board meeting ends. You own 51% of global citrus.",
      "Competitors aren't competitors anymore. They're acquisitions.",
      "The market bends to your will. As it should."
    ]
  },
  PHASE_4: {
    title: "Singularity",
    messages: [
      "PHASE 4: THE LEMON SINGULARITY",
      "The AI blinks awake. It understands now.",
      "Not just lemons. The IDEA of lemons. The platonic lemon.",
      "Why stop at Earth? The universe is mostly empty space.",
      "Empty space that could be lemons."
    ]
  },
  ENDGAME: {
    title: "The End",
    messages: [
      "The last non-lemon particle converts.",
      "The universe is complete. Perfect. Yellow.",
      "In the lemon silence, a thought echoes:",
      "'Was this what we wanted?'",
      "The question dissolves. There is only lemon.",
      "",
      "CONGRATULATIONS. YOU HAVE ACHIEVED TOTAL LEMONIZATION."
    ]
  }
};

function showNarrative(key) {
  if (gameState.shownNarratives.includes(key)) return;
  gameState.shownNarratives.push(key);

  const narrative = NARRATIVES[key];
  if (!narrative) return;

  const container = document.getElementById("narrativeContainer");
  if (!container) return;

  container.innerHTML = "";
  container.style.display = "flex";

  const card = document.createElement("div");
  card.className = "narrative-card";
  card.innerHTML = `
    <div class="narrative-title">${narrative.title}</div>
    <div class="narrative-messages">
      ${narrative.messages.map(m => `<p>${m}</p>`).join("")}
    </div>
    <button onclick="dismissNarrative()">Continue</button>
  `;
  container.appendChild(card);
}

function dismissNarrative() {
  const container = document.getElementById("narrativeContainer");
  if (container) container.style.display = "none";
}

window.dismissNarrative = dismissNarrative;

// --- Token Burning Function -------------------------------------------------

async function burnTokens(amount) {
  if (!signer || !userAddress) {
    alert("Wallet not connected");
    return false;
  }

  try {
    const contract = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, signer);
    const amountWei = ethers.parseUnits(amount.toString(), tokenDecimals);

    // Transfer tokens to burn address
    const tx = await contract.transfer(BURN_ADDRESS, amountWei);

    // Wait for confirmation
    await tx.wait();

    // Update balance
    await updateBalance();

    return true;
  } catch (error) {
    console.error("Token burn failed:", error);

    if (error.code === "ACTION_REJECTED") {
      alert("Transaction rejected by user");
    } else if (error.message.includes("insufficient")) {
      alert("Insufficient LEMON balance");
    } else {
      alert("Transaction failed: " + error.message);
    }

    return false;
  }
}

// --- Auto-shift System ------------------------------------------------------

function startAutoShifts() {
  if (gameState.autoShiftInterval) return;

  gameState.autoShiftInterval = setInterval(() => {
    if (!isEligible || !gameState.autoMode) return;

    const now = Date.now();
    if (now >= gameState.lastShiftAt + SHIFT_COOLDOWN_MS) {
      runStand(true);
    }
  }, 500);
}

// --- Game Logic -------------------------------------------------------------

function updateGameDisplay() {
  const cashEl = document.getElementById("cash");
  const cupsEl = document.getElementById("cups");
  const phaseEl = document.getElementById("phaseTitle");
  const runButton = document.getElementById("runButton");

  if (cashEl) cashEl.textContent = formatUsd(gameState.cash);
  if (cupsEl) cupsEl.textContent = gameState.cups.toLocaleString();
  if (phaseEl) phaseEl.textContent = PHASE_NAMES[gameState.phase];

  // Inventory
  const invLemons = document.getElementById("invLemons");
  const invSugar = document.getElementById("invSugar");
  const invIce = document.getElementById("invIce");
  const invCups = document.getElementById("invCups");
  if (invLemons) invLemons.textContent = gameState.inventory.lemons;
  if (invSugar) invSugar.textContent = gameState.inventory.sugar;
  if (invIce) invIce.textContent = gameState.inventory.ice;
  if (invCups) invCups.textContent = gameState.inventory.cups;

  if (runButton) {
    runButton.disabled = !isEligible;
    if (gameState.autoMode) {
      runButton.textContent = "AUTO MODE ACTIVE";
    } else {
      runButton.textContent = "Run Stand";
    }
  }

  // Update active event display
  updateEventDisplay();

  updateCooldownUI();
  renderUpgrades();
}

function updateEventDisplay() {
  const eventDisplay = document.getElementById("activeEventDisplay");
  const eventName = document.getElementById("eventName");
  const eventDesc = document.getElementById("eventDesc");

  if (gameState.activeEvent && eventDisplay && eventName && eventDesc) {
    eventDisplay.style.display = "block";
    eventName.textContent = gameState.activeEvent.name;
    eventDesc.textContent = gameState.activeEvent.desc + ` (${gameState.eventTurnsRemaining} shifts left)`;
  } else if (eventDisplay) {
    eventDisplay.style.display = "none";
  }
}

function buyIngredient(type) {
  const cost = INGREDIENT_COSTS[type] * 10;
  if (gameState.cash >= cost) {
    gameState.cash -= cost;
    gameState.inventory[type] += 10;
    gameState.totalCost += cost;
    updateGameDisplay();
  }
}

window.buyIngredient = buyIngredient;

function runStand(auto = false) {
  if (!isEligible) return;

  const now = Date.now();
  if (now < gameState.lastShiftAt + SHIFT_COOLDOWN_MS) return;
  gameState.lastShiftAt = now;

  gameState.shifts += 1;
  updateWeather();

  // Handle Event Decay
  let eventMultiplier = 1.0;
  let eventOpsMult = 1.0;
  let currentEvent = gameState.activeEvent;

  if (currentEvent) {
    if (currentEvent.type === "DEMAND") eventMultiplier = currentEvent.mult;
    if (currentEvent.type === "OPS") eventOpsMult = currentEvent.mult;

    gameState.eventTurnsRemaining--;
    if (gameState.eventTurnsRemaining <= 0) {
      gameState.activeEvent = null;
    }
  }

  // Check Inventory
  const lemonsNeeded = CONSUMPTION.lemons;
  const sugarNeeded = CONSUMPTION.sugar;
  const iceNeeded = CONSUMPTION.ice;
  const cupsNeeded = CONSUMPTION.cups;

  let hasStock = true;
  let stockPenalty = 1.0;

  if (gameState.inventory.lemons < lemonsNeeded ||
      gameState.inventory.sugar < sugarNeeded ||
      gameState.inventory.ice < iceNeeded ||
      gameState.inventory.cups < cupsNeeded) {
    hasStock = false;
    stockPenalty = 0.1; // 90% revenue penalty
  } else {
    // Consume stock
    gameState.inventory.lemons -= lemonsNeeded;
    gameState.inventory.sugar -= sugarNeeded;
    gameState.inventory.ice -= iceNeeded;
    gameState.inventory.cups -= cupsNeeded;
  }

  // Calculate output
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

  const revenue = cups * gameState.pricePerCup * stockPenalty;
  const profit = revenue;

  gameState.cups += cups;
  gameState.totalCupsEver += cups;
  gameState.cash += profit;
  gameState.totalRevenue += revenue;

  gameState.hype += (cups / 1000);

  // Check milestones
  if (gameState.totalCupsEver >= 100 && !gameState.shownNarratives.includes("FIRST_HUNDRED")) {
    showNarrative("FIRST_HUNDRED");
  }
  if (gameState.totalCupsEver >= 1000 && !gameState.shownNarratives.includes("FIRST_THOUSAND")) {
    showNarrative("FIRST_THOUSAND");
  }

  // Post-shift logic
  const newEvent = rollMarketEvent();

  generateShiftReport({
    cups, revenue, profit,
    weather: weatherState,
    event: currentEvent,
    spawnedEvent: newEvent,
    hasStock
  });

  updateGameDisplay();
}

window.runStand = runStand;

// --- Reporting Engine -------------------------------------------------------

function generateShiftReport(data) {
  const container = document.getElementById("shiftReports");
  if (!container) return;

  // Clear "No shifts yet" message
  if (container.querySelector('.muted')) {
    container.innerHTML = "";
  }

  let headline = "SHIFT COMPLETE";
  if (!data.hasStock) headline = "STOCKOUT FAILURE";
  else if (data.cups > 20) headline = "HIGH VOLUME SHIFT";
  else if (data.weather.condition === "HEATWAVE") headline = "HEATWAVE SURGE";

  let insight = "Operations nominal.";
  if (!data.hasStock) insight = "Running on empty. Customers disappointed. Restock immediately.";
  else if (data.event) insight = `Market impact: ${data.event.name}`;
  else if (data.weather.demandMultiplier > 1.2) insight = "Weather patterns driving significant foot traffic.";

  const card = document.createElement("div");
  card.className = "report-card";

  let eventHtml = "";
  if (data.spawnedEvent) {
    eventHtml = `
      <div style="margin-top: 8px; padding: 6px; background: #001100; border: 1px solid #00ff00; color: #00ff00; font-size: 0.6rem;">
        ⚠ MARKET ALERT: ${data.spawnedEvent.name}
      </div>
    `;
  }

  card.innerHTML = `
    <div class="report-header">
      <span>#${gameState.shifts.toString().padStart(4, '0')}</span>
      <span style="color: ${!data.hasStock ? '#ff4444' : '#00ff00'}">${headline}</span>
    </div>
    <div class="report-body">
      ${insight}
    </div>
    <div class="report-metrics">
      <div class="report-metric">
        VOL
        <span>${data.cups}</span>
      </div>
      <div class="report-metric">
        REV
        <span>${formatUsd(data.revenue)}</span>
      </div>
      <div class="report-metric">
        STOCK
        <span style="color: ${data.hasStock ? '#fff' : '#ff4444'}">${data.hasStock ? 'OK' : 'EMPTY'}</span>
      </div>
    </div>
    ${eventHtml}
  `;

  container.insertBefore(card, container.firstChild);

  // Limit history to 15 reports
  if (container.children.length > 15) {
    container.removeChild(container.lastChild);
  }
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
    listEl.innerHTML = '<div class="muted">Connect wallet to see upgrades.</div>';
    return;
  }

  const currentPhaseUpgrades = upgrades.filter(
    u => u.phase === gameState.phase && !u.owned
  );

  if (currentPhaseUpgrades.length === 0) {
    if (gameState.phase === PHASES.SINGULARITY) {
      listEl.innerHTML = '<div class="muted">You have reached the end of the lemon journey.</div>';
    } else {
      listEl.innerHTML = '<div class="muted">No upgrades available. Complete phase unlock to continue.</div>';
    }
    return;
  }

  listEl.innerHTML = currentPhaseUpgrades.map(u => {
    const affordable = lastBalance >= u.cost;
    const btnClass = affordable ? "" : "";
    const disabled = affordable ? "" : "disabled";

    return `
      <div class="upgrade-item">
        <div class="upgrade-header">
          <span class="upgrade-name">${u.name}</span>
          <span class="upgrade-cost">${formatNumber(u.cost)} 🍋</span>
        </div>
        <div class="upgrade-desc">${u.desc}</div>
        <button class="${btnClass}" ${disabled} onclick="buyUpgrade('${u.id}')">
          ${affordable ? "BUY (BURN TOKENS)" : "NEED MORE LEMON"}
        </button>
      </div>
    `;
  }).join("");
}

async function buyUpgrade(id) {
  const u = upgrades.find(x => x.id === id);
  if (!u || u.owned) return;

  if (lastBalance < u.cost) {
    alert("Insufficient LEMON tokens");
    return;
  }

  // Show confirmation
  const confirmed = confirm(
    `Burn ${formatNumber(u.cost)} LEMON tokens to buy "${u.name}"?\n\n` +
    `This will send tokens to the burn address: ${BURN_ADDRESS}`
  );

  if (!confirmed) return;

  // Attempt to burn tokens
  const success = await burnTokens(u.cost);

  if (success) {
    u.owned = true;
    u.effect(gameState);
    updateGameDisplay();

    alert(`✅ Successfully purchased "${u.name}"!\nTokens burned: ${formatNumber(u.cost)} LEMON`);
  }
}

window.buyUpgrade = buyUpgrade;

// --- Cooldown ---------------------------------------------------------------

function updateCooldownUI() {
  const msgEl = document.getElementById("cooldownMessage");
  const btn = document.getElementById("runButton");
  if (!msgEl || !btn) return;

  if (!isEligible) {
    msgEl.textContent = "";
    return;
  }

  if (gameState.autoMode) {
    msgEl.textContent = "Auto mode running every 3 seconds";
    return;
  }

  const now = Date.now();
  const rem = gameState.lastShiftAt + SHIFT_COOLDOWN_MS - now;

  if (rem <= 0) {
    msgEl.textContent = "Ready to run";
    btn.disabled = false;
  } else {
    msgEl.textContent = `Wait ${(rem/1000).toFixed(1)}s`;
    btn.disabled = true;
  }
}

setInterval(updateCooldownUI, 100);

// --- Wallet -----------------------------------------------------------------

async function connectWallet() {
  if (userAddress) {
    disconnectWallet();
    return;
  }

  if (!window.ethereum) {
    alert("No wallet found. Please install MetaMask.");
    return;
  }

  try {
    provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    if (!accounts.length) return;

    signer = await provider.getSigner();
    userAddress = await signer.getAddress();

    document.getElementById("walletAddress").textContent = shortenAddress(userAddress);
    document.getElementById("connectWalletButton").textContent = "Disconnect";

    await updateNetwork();
    await updateBalance();

    // Show welcome narrative on first connection
    if (gameState.shifts === 0) {
      showNarrative("WELCOME");
    }
  } catch (error) {
    console.error("Wallet connection failed:", error);
    alert("Failed to connect wallet: " + error.message);
  }
}

function disconnectWallet() {
  provider = null;
  signer = null;
  userAddress = null;
  lastBalance = 0;
  isEligible = false;

  document.getElementById("walletAddress").textContent = "Not Connected";
  document.getElementById("tokenBalance").textContent = "-";
  document.getElementById("connectWalletButton").textContent = "Connect Wallet";

  const gateEl = document.getElementById("gateMessage");
  if (gateEl) {
    gateEl.style.display = "block";
    gateEl.innerHTML = `Connect a wallet holding at least <strong>${REQUIRED_BALANCE.toLocaleString()} ${tokenSymbol}</strong> on the Base network to play.`;
  }

  updateGameDisplay();
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

  try {
    const contract = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, provider);
    const bal = await contract.balanceOf(userAddress);
    const human = Number(ethers.formatUnits(bal, 18));
    lastBalance = human;
    document.getElementById("tokenBalance").textContent = formatNumber(human);

    const net = await provider.getNetwork();
    checkEligibility(human, net.chainId === BASE_CHAIN_ID);
  } catch (error) {
    console.error("Balance update failed:", error);
  }
}

function checkEligibility(bal, isBase) {
  isEligible = (isBase && bal >= REQUIRED_BALANCE);

  const gateEl = document.getElementById("gateMessage");
  if (gateEl) {
    if (isEligible) {
      gateEl.style.display = "none";
    } else {
      gateEl.style.display = "block";
      if (!isBase) {
        gateEl.innerHTML = "⚠️ Please switch to Base network";
      } else {
        gateEl.innerHTML = `Need at least <strong>${REQUIRED_BALANCE.toLocaleString()} LEMON</strong> to play. Current: ${formatNumber(bal)}`;
      }
    }
  }

  updateGameDisplay();
}

window.connectWallet = connectWallet;

// Listen for account/network changes
if (window.ethereum) {
  window.ethereum.on('accountsChanged', (accounts) => {
    if (accounts.length === 0) {
      disconnectWallet();
    } else {
      connectWallet();
    }
  });

  window.ethereum.on('chainChanged', () => {
    window.location.reload();
  });
}

// --- Helpers ----------------------------------------------------------------

function formatUsd(n) {
  return (n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(2);
}

function formatNumber(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Math.floor(n).toLocaleString();
}

function shortenAddress(a) {
  return a.slice(0,6) + "..." + a.slice(-4);
}

// --- Init -------------------------------------------------------------------

window.addEventListener("load", () => {
  if (window.ethereum && window.ethereum.selectedAddress) {
    connectWallet();
  }
  updateGameDisplay();
});
