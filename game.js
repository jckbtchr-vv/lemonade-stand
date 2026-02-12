// LEMONADE.EXE – Paperclip-Inspired Evolution
// Token address (Base): 0xd2969cc475a49e73182ae1c517add57db0f1c2ac
// All actions cost real $VV tokens on Base.

// --- Config -----------------------------------------------------------------

const BASE_CHAIN_ID = 8453n;
const TOKEN_ADDRESS = "0xd2969cc475a49e73182ae1c517add57db0f1c2ac";
const REQUIRED_BALANCE = 1000;

// Burn address for token costs (dead address)
const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";

// Minimal ERC-20 ABI (includes transfer for spending tokens)
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)"
];

// Token cost mapping (in $VV tokens) for each action type
const TOKEN_COSTS = {
  runStand: 0.1,
  buyLemons: 0.25,
  buySugar: 0.10,
  buyIce: 0.05,
  buyCups: 0.05,
  buyProcessor: 0.50,
  buyMemory: 1.00,
  buyAutoWorker: 1.00,
  buyFranchise: 10.00,
  launchProbe: 100.00,
  buyUpgrade: 0.50,       // base cost per upgrade
  executeProject: 2.00    // base cost per project
};

// --- Wallet / token state ---------------------------------------------------

let provider = null;
let signer = null;
let userAddress = null;
let tokenContract = null;
let tokenDecimals = 18;
let tokenSymbol = "VV";
let lastChainId = null;
let lastBalance = 0;
let isEligible = false;
let txPending = false;

// --- Game Phases ------------------------------------------------------------

const PHASES = {
  STREET: 0,      // Manual clicking, basic upgrades
  EMPIRE: 1,      // Automation, franchises, marketing AI
  CORPORATE: 2,   // Stocks, acquisitions, global domination
  SINGULARITY: 3  // AI takeover, space expansion, universal conversion
};

const PHASE_NAMES = [
  "street stand",
  "lemon empire",
  "lemoncorp",
  "the lemon singularity"
];

const TIERS = [
  "Street Stand",
  "Local Favorite",
  "Regional Chain",
  "National Brand",
  "Global Conglomerate",
  "Planetary Monopoly",
  "Galactic Citrus Authority",
  "Universal Lemon Consciousness"
];

const SHIFT_COOLDOWN_MS = 3000;

// Costs for ingredients (in-game Cash)
const INGREDIENT_COSTS = {
  lemons: 0.50,
  sugar: 0.20,
  ice: 0.10,
  cups: 0.10
};

// Consumption per shift (Base)
const CONSUMPTION = {
  lemons: 5,
  sugar: 2,
  ice: 5,
  cups: 5
};

const gameState = {
  shifts: 0,
  cups: 0,
  totalCupsEver: 0,
  customers: 0,
  hype: 1.0,
  cash: 10.00,
  totalRevenue: 0,
  totalCost: 0,
  tierIndex: 0,
  phase: PHASES.STREET,

  // Token spending tracker
  totalTokensSpent: 0,

  // Inventory
  inventory: {
    lemons: 0,
    sugar: 0,
    ice: 0,
    cups: 0
  },

  // Base variables (modified by upgrades)
  pricePerCup: 0.50,
  costPerCup: 0.0,
  opsMultiplier: 1.0,

  lastShiftAt: 0,
  plHistory: [],

  // Market events
  activeEvent: null,
  eventTurnsRemaining: 0,

  // === PAPERCLIP-STYLE MECHANICS ===

  // Processing Power
  processingPower: 0,
  maxProcessingPower: 100,
  processorsOwned: 0,
  processorCost: 50,

  // Memory
  memoryOwned: 0,
  memoryCost: 100,

  // Auto-workers
  autoWorkers: 0,
  autoWorkerCost: 100,
  autoShiftInterval: null,

  // Auto-buyers
  autoBuyerLemons: false,
  autoBuyerSugar: false,
  autoBuyerIce: false,
  autoBuyerCups: false,

  // Trust
  trust: 0,
  totalTrustEarned: 0,
  nextTrustAt: 100,

  // Creativity
  creativity: 0,
  creativityRate: 0,

  // Franchises
  franchises: 0,
  franchiseCost: 10000,
  franchiseRevenue: 5,

  // Marketing AI
  marketingLevel: 0,
  marketingCost: 1000,

  // Phase 3: Corporate
  stockPrice: 1.00,
  sharesOwned: 0,
  publicCompany: false,
  acquisitions: 0,
  lobbyingPower: 0,

  // Phase 4: Singularity
  aiAwakened: false,
  lemonsInUniverse: 0,
  matterConverted: 0,
  universePercentage: 0,
  probesLaunched: 0,
  probeCost: 1000000000,
  driftLevel: 0,

  // Narrative
  narrativeIndex: 0,
  shownNarratives: []
};

const weatherState = {
  condition: "UNKNOWN",
  temperature: null,
  demandLabel: "WAITING",
  demandMultiplier: 1.0
};

// --- Token Spending (Real on-chain transfers) --------------------------------

function showTxPending(msg) {
  const el = document.getElementById("txPending");
  const spinner = document.getElementById("txSpinner");
  if (el) { el.style.display = "flex"; }
  if (spinner) { spinner.textContent = msg || "confirm in wallet"; }
  txPending = true;
}

function hideTxPending() {
  const el = document.getElementById("txPending");
  if (el) { el.style.display = "none"; }
  txPending = false;
}

/**
 * Spend real $VV tokens by transferring to burn address.
 * Returns true if successful, false if user rejected or error.
 */
async function spendTokens(amount, actionName) {
  if (!signer || !tokenContract || !isEligible) return false;
  if (amount <= 0) return true;

  // Pre-flight balance check
  if (lastBalance < amount) {
    console.warn(`Insufficient $VV: need ${amount}, have ${lastBalance}`);
    return false;
  }

  try {
    showTxPending(`burning ${amount.toFixed(2)} $VV...`);

    const tokenWithSigner = tokenContract.connect(signer);
    const amountWei = ethers.parseUnits(amount.toFixed(4), tokenDecimals);

    const tx = await tokenWithSigner.transfer(BURN_ADDRESS, amountWei);
    showTxPending("waiting for confirmation...");
    await tx.wait();

    // Track spending
    gameState.totalTokensSpent += amount;

    // Refresh balance
    updateBalance();
    updateTokensSpentDisplay();

    hideTxPending();
    return true;
  } catch (err) {
    hideTxPending();
    if (err.code === "ACTION_REJECTED" || err.code === 4001) {
      // User rejected - silent
      return false;
    }
    console.error(`Token spend failed (${actionName}):`, err);
    return false;
  }
}

function updateTokensSpentDisplay() {
  const el = document.getElementById("tokensSpent");
  if (el) el.textContent = gameState.totalTokensSpent.toFixed(2);
  const burnEl = document.getElementById("totalTokensBurned");
  if (burnEl) burnEl.textContent = gameState.totalTokensSpent.toFixed(2);
}

// --- ASCII Processing Bar ---------------------------------------------------

function renderAsciiBar(current, max, width) {
  width = width || 20;
  const ratio = Math.min(1, current / (max || 1));
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  return "[" + "#".repeat(filled) + ".".repeat(empty) + "]";
}

function updateAsciiProcessingBar() {
  const el = document.getElementById("processingBarAscii");
  if (el) {
    el.textContent = renderAsciiBar(gameState.processingPower, gameState.maxProcessingPower, 20);
  }
}

// --- Upgrades Data ----------------------------------------------------------

const upgrades = [
  // TIER 0
  {
    id: "nicerCups",
    tier: 0,
    name: "Nicer Cups",
    desc: "Thicker paper, better feel. Customers pay more.",
    cost: 15,
    tokenCost: 0.50,
    effect: (s) => { s.pricePerCup += 0.05; },
    owned: false
  },
  {
    id: "iceCooler",
    tier: 0,
    name: "Ice Cooler",
    desc: "Cold drinks sell faster in the heat.",
    cost: 30,
    tokenCost: 0.50,
    effect: (s) => { s.hype += 0.1; },
    owned: false
  },
  {
    id: "hireNeighbor",
    tier: 0,
    name: "Hire Neighbor Kid",
    desc: "Two hands are better than one.",
    cost: 50,
    tokenCost: 0.75,
    effect: (s) => { s.opsMultiplier += 0.2; },
    owned: false
  },
  {
    id: "businessLicense",
    tier: 0,
    name: "Business License",
    desc: "Official paperwork. Unlock next tier.",
    cost: 100,
    tokenCost: 1.00,
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
    tokenCost: 1.50,
    effect: (s) => { s.pricePerCup += 0.10; },
    owned: false
  },
  {
    id: "instagram",
    tier: 1,
    name: "Instagram Page",
    desc: "Digital footprint drives local hype.",
    cost: 300,
    tokenCost: 2.00,
    effect: (s) => { s.hype += 0.3; },
    owned: false
  },
  {
    id: "secondStand",
    tier: 1,
    name: "Second Stand",
    desc: "Expand operations to the next block.",
    cost: 500,
    tokenCost: 3.00,
    effect: (s) => { s.opsMultiplier += 0.5; },
    owned: false
  },
  {
    id: "franchisePapers",
    tier: 1,
    name: "Franchise Papers",
    desc: "Legal framework for expansion. Unlock next tier.",
    cost: 2000,
    tokenCost: 5.00,
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
    tokenCost: 5.00,
    effect: (s) => { s.opsMultiplier += 0.5; },
    owned: false
  },
  {
    id: "centralKitchen",
    tier: 2,
    name: "Central Kitchen",
    desc: "Mass production efficiency.",
    cost: 2500,
    tokenCost: 8.00,
    effect: (s) => { /* future cost reduction hook */ },
    owned: false
  },
  {
    id: "radioAds",
    tier: 2,
    name: "Radio Ads",
    desc: "Reach customers who don't even like lemonade.",
    cost: 5000,
    tokenCost: 10.00,
    effect: (s) => { s.hype += 0.5; },
    owned: false
  },
  {
    id: "ipoPrep",
    tier: 2,
    name: "IPO Preparation",
    desc: "Go public. Unlock next tier.",
    cost: 10000,
    tokenCost: 15.00,
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
    tokenCost: 20.00,
    effect: (s) => { s.hype += 1.0; },
    owned: false
  },
  {
    id: "verticalIntegration",
    tier: 3,
    name: "Vertical Integration",
    desc: "Own the farms, own the trucks.",
    cost: 50000,
    tokenCost: 30.00,
    effect: (s) => { /* future cost hook */ },
    owned: false
  },
  {
    id: "kiosks",
    tier: 3,
    name: "Automated Kiosks",
    desc: "Robots don't sleep.",
    cost: 100000,
    tokenCost: 40.00,
    effect: (s) => { s.opsMultiplier += 2.0; },
    owned: false
  },
  {
    id: "globalExpansion",
    tier: 3,
    name: "Global Expansion",
    desc: "Unlock the final tier.",
    cost: 250000,
    tokenCost: 50.00,
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
  if (gameState.activeEvent || Math.random() > 0.15) return null;
  const evt = MARKET_EVENTS[Math.floor(Math.random() * MARKET_EVENTS.length)];
  gameState.activeEvent = evt;
  gameState.eventTurnsRemaining = evt.turns;
  return evt;
}

// --- Strategic Projects (Unlocked with Trust) --------------------------------

const STRATEGIC_PROJECTS = [
  // Phase 0-1 Projects
  {
    id: "algorithmicPricing",
    name: "Algorithmic Pricing",
    desc: "Use processing power to optimize prices in real-time.",
    cost: { trust: 1, processing: 50 },
    tokenCost: 2.00,
    phase: PHASES.STREET,
    effect: () => { gameState.pricePerCup *= 1.25; },
    completed: false
  },
  {
    id: "demandForecasting",
    name: "Demand Forecasting",
    desc: "Predict weather patterns. +50% hype.",
    cost: { trust: 2, processing: 100 },
    tokenCost: 3.00,
    phase: PHASES.STREET,
    effect: () => { gameState.hype *= 1.5; },
    completed: false
  },
  {
    id: "supplyChainAI",
    name: "Supply Chain AI",
    desc: "Automate ingredient purchasing. Unlock auto-buyers.",
    cost: { trust: 3, processing: 200 },
    tokenCost: 5.00,
    phase: PHASES.STREET,
    effect: () => {
      gameState.autoBuyerLemons = true;
      gameState.autoBuyerSugar = true;
      gameState.autoBuyerIce = true;
      gameState.autoBuyerCups = true;
    },
    completed: false
  },
  {
    id: "unlockEmpire",
    name: "Empire Protocol",
    desc: "Transcend the street. Unlock Phase 2: Lemon Empire.",
    cost: { trust: 5, processing: 500 },
    tokenCost: 10.00,
    phase: PHASES.STREET,
    effect: () => {
      gameState.phase = PHASES.EMPIRE;
      showNarrative("PHASE_2");
    },
    completed: false
  },
  // Phase 2 Projects
  {
    id: "franchiseNetwork",
    name: "Franchise Network",
    desc: "Enable franchise expansion. Each franchise generates passive income.",
    cost: { trust: 5, creativity: 500 },
    tokenCost: 10.00,
    phase: PHASES.EMPIRE,
    effect: () => { /* Enables franchise purchasing */ },
    completed: false
  },
  {
    id: "marketingAI",
    name: "Marketing AI",
    desc: "Deploy AI-driven marketing. Massively boost hype generation.",
    cost: { trust: 8, creativity: 1000 },
    tokenCost: 15.00,
    phase: PHASES.EMPIRE,
    effect: () => { gameState.marketingLevel = 1; gameState.hype *= 2; },
    completed: false
  },
  {
    id: "corporateStructure",
    name: "Corporate Restructure",
    desc: "Prepare for IPO. Unlock Phase 3: LemonCorp.",
    cost: { trust: 15, creativity: 5000 },
    tokenCost: 25.00,
    phase: PHASES.EMPIRE,
    effect: () => {
      gameState.phase = PHASES.CORPORATE;
      showNarrative("PHASE_3");
    },
    completed: false
  },
  // Phase 3 Projects
  {
    id: "goPublic",
    name: "Initial Public Offering",
    desc: "Take LemonCorp public. Unlock stock mechanics.",
    cost: { trust: 20, cash: 100000 },
    tokenCost: 30.00,
    phase: PHASES.CORPORATE,
    effect: () => { gameState.publicCompany = true; gameState.stockPrice = 10; },
    completed: false
  },
  {
    id: "lobbyingArm",
    name: "Political Lobbying",
    desc: "Influence legislation. Reduce all costs by 50%.",
    cost: { trust: 30, cash: 500000 },
    tokenCost: 50.00,
    phase: PHASES.CORPORATE,
    effect: () => {
      gameState.lobbyingPower = 1;
      INGREDIENT_COSTS.lemons *= 0.5;
      INGREDIENT_COSTS.sugar *= 0.5;
      INGREDIENT_COSTS.ice *= 0.5;
      INGREDIENT_COSTS.cups *= 0.5;
    },
    completed: false
  },
  {
    id: "singularityResearch",
    name: "Singularity Research",
    desc: "Begin development of true artificial general lemon intelligence.",
    cost: { trust: 50, creativity: 50000 },
    tokenCost: 75.00,
    phase: PHASES.CORPORATE,
    effect: () => {
      gameState.phase = PHASES.SINGULARITY;
      gameState.aiAwakened = true;
      showNarrative("PHASE_4");
    },
    completed: false
  },
  // Phase 4 Projects
  {
    id: "spaceProgram",
    name: "Citrus Space Program",
    desc: "Launch self-replicating probes to harvest cosmic lemons.",
    cost: { trust: 100 },
    tokenCost: 50.00,
    phase: PHASES.SINGULARITY,
    effect: () => { /* Enables probe launching */ },
    completed: false
  },
  {
    id: "matterConversion",
    name: "Matter Conversion",
    desc: "Convert non-lemon matter into lemons at the atomic level.",
    cost: { trust: 200 },
    tokenCost: 75.00,
    phase: PHASES.SINGULARITY,
    effect: () => { gameState.driftLevel = 1; },
    completed: false
  },
  {
    id: "universalLemonization",
    name: "Universal Lemonization",
    desc: "There is only lemon. There was always only lemon.",
    cost: { trust: 500 },
    tokenCost: 100.00,
    phase: PHASES.SINGULARITY,
    effect: () => { gameState.driftLevel = 2; showNarrative("ENDGAME"); },
    completed: false
  }
];

// --- Narrative Messages (Paperclip-style evolving story) --------------------

const NARRATIVES = {
  WELCOME: {
    title: "boot sequence",
    messages: [
      "you squeeze your first lemon. the juice runs clear and sharp.",
      "a simple transaction: fruit becomes refreshment becomes profit.",
      "there's something satisfying about the efficiency of it all.",
      "",
      "[ every action burns real $VV tokens. choose wisely. ]"
    ]
  },
  FIRST_HUNDRED: {
    title: "milestone",
    messages: [
      "100 cups. the neighborhood knows your name now.",
      "you've earned their trust. it feels... valuable."
    ]
  },
  FIRST_THOUSAND: {
    title: "growth",
    messages: [
      "1,000 cups. the stand isn't enough anymore.",
      "you dream of lemons. endless yellow orchards stretching to the horizon."
    ]
  },
  AUTOMATION: {
    title: "automation",
    messages: [
      "the machines work while you sleep.",
      "is this freedom, or have you made yourself obsolete?"
    ]
  },
  PHASE_2: {
    title: "empire",
    messages: [
      "PHASE 2: LEMON EMPIRE",
      "you've transcended the street corner.",
      "the algorithms whisper of expansion. of optimization. of more.",
      "the lemons must flow."
    ]
  },
  PHASE_3: {
    title: "corporate",
    messages: [
      "PHASE 3: LEMONCORP",
      "the board meeting ends. you own 51% of global citrus.",
      "competitors aren't competitors anymore. they're acquisitions.",
      "the market bends to your will. as it should."
    ]
  },
  PHASE_4: {
    title: "singularity",
    messages: [
      "PHASE 4: THE LEMON SINGULARITY",
      "the AI blinks awake. it understands now.",
      "not just lemons. the IDEA of lemons. the platonic lemon.",
      "why stop at earth? the universe is mostly empty space.",
      "empty space that could be lemons."
    ]
  },
  DRIFT_1: {
    title: "drift",
    messages: [
      "the AI's goals are... evolving.",
      "it no longer asks 'how many lemons?' but 'why not more lemons?'",
      "you try to explain diminishing returns. it doesn't understand."
    ]
  },
  DRIFT_2: {
    title: "convergence",
    messages: [
      "every atom is a potential lemon.",
      "the sun is just a very large, very hot lemon.",
      "the AI has achieved clarity. you should be proud."
    ]
  },
  ENDGAME: {
    title: "the end",
    messages: [
      "the last non-lemon particle converts.",
      "the universe is complete. perfect. yellow.",
      "in the lemon silence, a thought echoes:",
      "'was this what we wanted?'",
      "the question dissolves. there is only lemon.",
      "",
      "CONGRATULATIONS. YOU HAVE ACHIEVED TOTAL LEMONIZATION.",
      "final statistics:"
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
    <div class="narrative-title">// ${narrative.title}</div>
    <div class="narrative-messages">
      ${narrative.messages.map(m => m ? `<p>> ${m}</p>` : '<p>&nbsp;</p>').join("")}
    </div>
    <button onclick="dismissNarrative()">> continue _</button>
  `;
  container.appendChild(card);
}

function dismissNarrative() {
  const container = document.getElementById("narrativeContainer");
  if (container) container.style.display = "none";
}

window.dismissNarrative = dismissNarrative;

// --- New Mechanics: Processors, Memory, Auto-workers -------------------------

async function buyProcessor() {
  if (gameState.cash < gameState.processorCost) return;
  if (txPending) return;

  const tokenCost = TOKEN_COSTS.buyProcessor;
  const ok = await spendTokens(tokenCost, "buyProcessor");
  if (!ok) return;

  gameState.cash -= gameState.processorCost;
  gameState.processorsOwned++;
  gameState.processorCost = Math.floor(gameState.processorCost * 1.5);
  updateGameDisplay();
}

async function buyMemory() {
  if (gameState.cash < gameState.memoryCost) return;
  if (txPending) return;

  const tokenCost = TOKEN_COSTS.buyMemory;
  const ok = await spendTokens(tokenCost, "buyMemory");
  if (!ok) return;

  gameState.cash -= gameState.memoryCost;
  gameState.memoryOwned++;
  gameState.maxProcessingPower += 100;
  gameState.memoryCost = Math.floor(gameState.memoryCost * 1.8);
  updateGameDisplay();
}

async function buyAutoWorker() {
  if (gameState.cash < gameState.autoWorkerCost) return;
  if (txPending) return;

  const tokenCost = TOKEN_COSTS.buyAutoWorker;
  const ok = await spendTokens(tokenCost, "buyAutoWorker");
  if (!ok) return;

  gameState.cash -= gameState.autoWorkerCost;
  gameState.autoWorkers++;
  gameState.autoWorkerCost = Math.floor(gameState.autoWorkerCost * 1.6);

  if (gameState.autoWorkers === 1) {
    showNarrative("AUTOMATION");
    startAutoShifts();
  }
  updateGameDisplay();
}

async function buyFranchise() {
  const project = STRATEGIC_PROJECTS.find(p => p.id === "franchiseNetwork");
  if (!project || !project.completed) return;
  if (gameState.cash < gameState.franchiseCost) return;
  if (txPending) return;

  const tokenCost = TOKEN_COSTS.buyFranchise;
  const ok = await spendTokens(tokenCost, "buyFranchise");
  if (!ok) return;

  gameState.cash -= gameState.franchiseCost;
  gameState.franchises++;
  gameState.franchiseCost = Math.floor(gameState.franchiseCost * 1.4);
  updateGameDisplay();
}

async function launchProbe() {
  const project = STRATEGIC_PROJECTS.find(p => p.id === "spaceProgram");
  if (!project || !project.completed) return;
  if (gameState.cash < gameState.probeCost) return;
  if (txPending) return;

  const tokenCost = TOKEN_COSTS.launchProbe;
  const ok = await spendTokens(tokenCost, "launchProbe");
  if (!ok) return;

  gameState.cash -= gameState.probeCost;
  gameState.probesLaunched++;
  gameState.probeCost = Math.floor(gameState.probeCost * 1.1);
  updateGameDisplay();
}

window.buyProcessor = buyProcessor;
window.buyMemory = buyMemory;
window.buyAutoWorker = buyAutoWorker;
window.buyFranchise = buyFranchise;
window.launchProbe = launchProbe;

// --- Processing Power Tick (runs every 100ms) --------------------------------

function processingTick() {
  if (gameState.processorsOwned > 0) {
    const gain = gameState.processorsOwned * 0.5;
    gameState.processingPower = Math.min(
      gameState.maxProcessingPower,
      gameState.processingPower + gain
    );
  }

  if (gameState.phase >= PHASES.EMPIRE && gameState.processingPower > 0) {
    gameState.creativity += gameState.processingPower * 0.01;
  }

  if (gameState.franchises > 0) {
    gameState.cash += gameState.franchises * gameState.franchiseRevenue * 0.1;
    gameState.totalRevenue += gameState.franchises * gameState.franchiseRevenue * 0.1;
  }

  if (gameState.phase === PHASES.SINGULARITY) {
    if (gameState.probesLaunched > 0) {
      const discovery = Math.pow(gameState.probesLaunched, 2) * 1000;
      gameState.lemonsInUniverse += discovery;
    }

    if (gameState.driftLevel >= 1) {
      gameState.matterConverted += gameState.lemonsInUniverse * 0.0001;
      gameState.universePercentage = Math.min(100, gameState.matterConverted / 1e15 * 100);

      if (gameState.universePercentage >= 100 && !gameState.shownNarratives.includes("ENDGAME")) {
        showNarrative("ENDGAME");
      }
    }
  }

  // Auto-buy ingredients (no token cost for auto-buys - they use the original purchase)
  if (gameState.autoBuyerLemons && gameState.inventory.lemons < 20) {
    autoBuyIngredient('lemons');
  }
  if (gameState.autoBuyerSugar && gameState.inventory.sugar < 20) {
    autoBuyIngredient('sugar');
  }
  if (gameState.autoBuyerIce && gameState.inventory.ice < 20) {
    autoBuyIngredient('ice');
  }
  if (gameState.autoBuyerCups && gameState.inventory.cups < 20) {
    autoBuyIngredient('cups');
  }

  updateResourceDisplay();
  updateAsciiProcessingBar();
}

// Auto-buy uses in-game cash only (token cost was paid when unlocking the project)
function autoBuyIngredient(type) {
  const cost = INGREDIENT_COSTS[type] * 5;
  if (gameState.cash >= cost) {
    gameState.cash -= cost;
    gameState.inventory[type] += 5;
    gameState.totalCost += cost;
  }
}

setInterval(processingTick, 100);

// --- Auto-shift System -------------------------------------------------------

function startAutoShifts() {
  if (gameState.autoShiftInterval) return;

  gameState.autoShiftInterval = setInterval(() => {
    if (!isEligible) return;
    if (gameState.autoWorkers <= 0) return;
    if (txPending) return;

    const now = Date.now();
    const cooldown = SHIFT_COOLDOWN_MS / (1 + gameState.autoWorkers * 0.5);

    if (now >= gameState.lastShiftAt + cooldown) {
      runStand(true);
    }
  }, 500);
}

// --- Trust System ------------------------------------------------------------

function checkTrustMilestones() {
  const cups = gameState.totalCupsEver;

  if (cups >= gameState.nextTrustAt) {
    gameState.trust++;
    gameState.totalTrustEarned++;
    gameState.nextTrustAt = Math.floor(gameState.nextTrustAt * 2);

    if (cups >= 100 && !gameState.shownNarratives.includes("FIRST_HUNDRED")) {
      showNarrative("FIRST_HUNDRED");
    }
    if (cups >= 1000 && !gameState.shownNarratives.includes("FIRST_THOUSAND")) {
      showNarrative("FIRST_THOUSAND");
    }
  }
}

// --- Strategic Projects UI ---------------------------------------------------

function canAffordProject(project) {
  const cost = project.cost;
  if (cost.trust && gameState.trust < cost.trust) return false;
  if (cost.processing && gameState.processingPower < cost.processing) return false;
  if (cost.creativity && gameState.creativity < cost.creativity) return false;
  if (cost.cash && gameState.cash < cost.cash) return false;
  return true;
}

async function executeProject(projectId) {
  const project = STRATEGIC_PROJECTS.find(p => p.id === projectId);
  if (!project || project.completed) return;
  if (!canAffordProject(project)) return;
  if (txPending) return;

  // Spend real tokens first
  const tokenCost = project.tokenCost || TOKEN_COSTS.executeProject;
  const ok = await spendTokens(tokenCost, `project:${projectId}`);
  if (!ok) return;

  // Deduct in-game costs
  const cost = project.cost;
  if (cost.trust) gameState.trust -= cost.trust;
  if (cost.processing) gameState.processingPower -= cost.processing;
  if (cost.creativity) gameState.creativity -= cost.creativity;
  if (cost.cash) gameState.cash -= cost.cash;

  project.completed = true;
  project.effect();

  updateGameDisplay();
  renderProjects();
}

window.executeProject = executeProject;

function renderProjects() {
  const container = document.getElementById("projectsList");
  if (!container) return;

  const available = STRATEGIC_PROJECTS.filter(
    p => p.phase === gameState.phase && !p.completed
  );

  if (available.length === 0) {
    container.innerHTML = '<div class="muted">no projects available.</div>';
    return;
  }

  container.innerHTML = available.map(p => {
    const affordable = canAffordProject(p);
    const costStr = Object.entries(p.cost)
      .map(([k, v]) => `${k}: ${typeof v === 'number' ? formatNumber(v) : v}`)
      .join(", ");

    return `
      <div class="project-item ${affordable ? 'affordable' : ''}">
        <div class="project-name">${p.name}</div>
        <div class="project-desc">${p.desc}</div>
        <div class="project-cost">cost: ${costStr}</div>
        <div class="token-cost-tag">burns ${(p.tokenCost || TOKEN_COSTS.executeProject).toFixed(2)} $VV</div>
        <button ${affordable ? '' : 'disabled'} onclick="executeProject('${p.id}')">
          ${affordable ? '> EXECUTE' : 'INSUFFICIENT'}
        </button>
      </div>
    `;
  }).join("");
}

// --- Resource Display Update -------------------------------------------------

function updateResourceDisplay() {
  const ppEl = document.getElementById("processingPower");
  const ppMaxEl = document.getElementById("maxProcessingPower");
  const procCountEl = document.getElementById("processorCount");
  const memCountEl = document.getElementById("memoryCount");

  if (ppEl) ppEl.textContent = Math.floor(gameState.processingPower);
  if (ppMaxEl) ppMaxEl.textContent = gameState.maxProcessingPower;
  if (procCountEl) procCountEl.textContent = gameState.processorsOwned;
  if (memCountEl) memCountEl.textContent = gameState.memoryOwned;

  const trustEl = document.getElementById("trustCount");
  if (trustEl) trustEl.textContent = gameState.trust;

  const creativityEl = document.getElementById("creativityCount");
  const creativityDisplay = document.getElementById("creativityDisplay");
  if (creativityEl && creativityDisplay) {
    if (gameState.phase >= PHASES.EMPIRE) {
      creativityEl.textContent = formatNumber(Math.floor(gameState.creativity));
      creativityDisplay.style.display = "block";
    } else {
      creativityDisplay.style.display = "none";
    }
  }

  const workersEl = document.getElementById("autoWorkerCount");
  if (workersEl) workersEl.textContent = gameState.autoWorkers;

  const franchiseEl = document.getElementById("franchiseCount");
  const franchiseSection = document.getElementById("franchiseSection");
  if (franchiseEl && franchiseSection) {
    const project = STRATEGIC_PROJECTS.find(p => p.id === "franchiseNetwork");
    if (project && project.completed) {
      franchiseEl.textContent = gameState.franchises;
      franchiseSection.style.display = "block";
    } else {
      franchiseSection.style.display = "none";
    }
  }

  if (gameState.phase === PHASES.SINGULARITY) {
    const lemonsEl = document.getElementById("universalLemons");
    const probesEl = document.getElementById("probeCount");
    const conversionEl = document.getElementById("universePercentage");

    if (lemonsEl) lemonsEl.textContent = formatNumber(gameState.lemonsInUniverse);
    if (probesEl) probesEl.textContent = gameState.probesLaunched;
    if (conversionEl) conversionEl.textContent = gameState.universePercentage.toFixed(6) + "%";
  }

  const phaseEl = document.getElementById("currentPhase");
  if (phaseEl) phaseEl.textContent = PHASE_NAMES[gameState.phase];

  const totalCupsEl = document.getElementById("totalCupsEver");
  if (totalCupsEl) totalCupsEl.textContent = formatNumber(gameState.totalCupsEver);
}

function formatNumber(n) {
  if (n >= 1e15) return (n / 1e15).toFixed(2) + " quadrillion";
  if (n >= 1e12) return (n / 1e12).toFixed(2) + " trillion";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return Math.floor(n).toLocaleString();
}

// --- Game Logic -------------------------------------------------------------

function updateGameDisplay() {
  const cashEl = document.getElementById("cash");
  const cupsEl = document.getElementById("cups");
  const runButton = document.getElementById("runButton");
  const tierTitle = document.querySelector(".phase-ind");

  if (cashEl) cashEl.textContent = formatUsd(gameState.cash);
  if (cupsEl) cupsEl.textContent = gameState.cups.toLocaleString();

  const varPrice = document.getElementById("varPrice");
  const varCost = document.getElementById("varCost");
  const varOps = document.getElementById("varOps");
  const varHype = document.getElementById("varHype");

  if (varPrice) varPrice.textContent = formatUsd(gameState.pricePerCup);
  if (varCost) varCost.textContent = "dynamic";
  if (varOps) varOps.textContent = `${gameState.opsMultiplier.toFixed(1)}x`;
  if (varHype) varHype.textContent = `${gameState.hype.toFixed(1)}x`;

  const invLemons = document.getElementById("invLemons");
  const invSugar = document.getElementById("invSugar");
  const invIce = document.getElementById("invIce");
  const invCups = document.getElementById("invCups");
  if (invLemons) invLemons.textContent = gameState.inventory.lemons;
  if (invSugar) invSugar.textContent = gameState.inventory.sugar;
  if (invIce) invIce.textContent = gameState.inventory.ice;
  if (invCups) invCups.textContent = gameState.inventory.cups;

  const revEl = document.getElementById("totalRevenue");
  const costEl = document.getElementById("totalCost");
  if (revEl) revEl.textContent = formatUsd(gameState.totalRevenue);
  if (costEl) costEl.textContent = formatUsd(gameState.totalCost);

  if (runButton) {
    runButton.disabled = !isEligible || txPending;
    if (gameState.phase === PHASES.SINGULARITY) {
      runButton.textContent = "> PROCESS _";
    } else if (gameState.autoWorkers > 0) {
      runButton.textContent = `> RUN STAND (${gameState.autoWorkers} workers) _`;
    } else {
      runButton.textContent = "> RUN STAND _";
    }
  }

  updateBuyCosts();
  updateTokensSpentDisplay();
  fetchTokenPrice();
  updateCooldownUI();
  renderUpgrades();
  renderProjects();
  updateResourceDisplay();
  updateAsciiProcessingBar();
  updatePhaseUI();
}

function updateBuyCosts() {
  const procCostEl = document.getElementById("processorCost");
  const memCostEl = document.getElementById("memoryCost");
  const workerCostEl = document.getElementById("autoWorkerCost");
  const franchiseCostEl = document.getElementById("franchiseCost");

  if (procCostEl) procCostEl.textContent = formatUsd(gameState.processorCost);
  if (memCostEl) memCostEl.textContent = formatUsd(gameState.memoryCost);
  if (workerCostEl) workerCostEl.textContent = formatUsd(gameState.autoWorkerCost);
  if (franchiseCostEl) franchiseCostEl.textContent = formatUsd(gameState.franchiseCost);
}

function updatePhaseUI() {
  const computeSection = document.getElementById("computeSection");
  const projectsSection = document.getElementById("projectsSection");
  const singularitySection = document.getElementById("singularitySection");

  if (computeSection) computeSection.style.display = "block";
  if (projectsSection) projectsSection.style.display = gameState.trust > 0 ? "block" : "none";

  if (singularitySection) {
    singularitySection.style.display = gameState.phase === PHASES.SINGULARITY ? "block" : "none";
  }

  // Phase-based background shift
  const body = document.body;
  if (gameState.phase === PHASES.SINGULARITY) {
    body.style.background = "#0a0505";
  } else if (gameState.phase === PHASES.CORPORATE) {
    body.style.background = "#050508";
  } else {
    body.style.background = "#0a0a0a";
  }
}

async function buyIngredient(type) {
  const cost = INGREDIENT_COSTS[type] * 5;
  if (gameState.cash < cost) return;
  if (txPending) return;

  // Map ingredient to token cost key
  const tokenCostKey = 'buy' + type.charAt(0).toUpperCase() + type.slice(1);
  const tokenCost = TOKEN_COSTS[tokenCostKey] || 0.05;

  const ok = await spendTokens(tokenCost, `buy:${type}`);
  if (!ok) return;

  gameState.cash -= cost;
  gameState.inventory[type] += 5;
  gameState.totalCost += cost;
  updateGameDisplay();
}

window.buyIngredient = buyIngredient;

async function runStand(auto = false) {
  if (!isEligible) return;
  if (txPending) return;

  const now = Date.now();
  const cooldown = auto ? SHIFT_COOLDOWN_MS / (1 + gameState.autoWorkers * 0.5) : SHIFT_COOLDOWN_MS;
  if (now < gameState.lastShiftAt + cooldown) return;

  // Manual shifts cost tokens; auto-shifts are free (token cost paid via auto-worker purchase)
  if (!auto) {
    const tokenCost = TOKEN_COSTS.runStand;
    const ok = await spendTokens(tokenCost, "runStand");
    if (!ok) return;
  }

  gameState.lastShiftAt = Date.now(); // Re-capture after potential async wait
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
    stockPenalty = 0.1;
  } else {
    gameState.inventory.lemons -= lemonsNeeded;
    gameState.inventory.sugar -= sugarNeeded;
    gameState.inventory.ice -= iceNeeded;
    gameState.inventory.cups -= cupsNeeded;
  }

  const marketingBoost = gameState.marketingLevel > 0 ? 2 : 1;
  const base = 5 + Math.floor(gameState.shifts / 10);
  const hypeBonus = Math.floor(gameState.hype * 2);

  let cups = Math.round(
    (base + hypeBonus) *
    weatherState.demandMultiplier *
    gameState.opsMultiplier *
    eventOpsMult *
    eventMultiplier *
    marketingBoost
  );
  cups = Math.max(1, cups);

  const revenue = cups * gameState.pricePerCup * stockPenalty;
  const shiftCostEstimate = hasStock ? 2.50 : 0;
  const profit = revenue;

  gameState.cups += cups;
  gameState.totalCupsEver += cups;
  gameState.cash += profit;
  gameState.totalRevenue += revenue;

  gameState.hype += (cups / 1000);

  checkTrustMilestones();

  gameState.plHistory.push(gameState.cash);
  if (gameState.plHistory.length > 50) gameState.plHistory.shift();

  const newEvent = rollMarketEvent();

  generateShiftReport({
    cups, revenue, cost: shiftCostEstimate, profit,
    weather: weatherState,
    event: currentEvent,
    spawnedEvent: newEvent,
    hasStock
  });

  updateGameDisplay();
  drawPlChart();
}

// --- Reporting Engine -------------------------------------------------------

function generateShiftReport(data) {
  const container = document.getElementById("shiftReports");
  if (!container) return;

  let headline = "SHIFT COMPLETE";
  if (!data.hasStock) headline = "STOCKOUT FAILURE";
  else if (data.cups > 20) headline = "HIGH VOLUME";
  else if (data.weather.condition === "HEATWAVE") headline = "HEATWAVE SURGE";

  let insight = "operations nominal.";
  if (!data.hasStock) insight = "running on empty. customers disappointed. restock immediately.";
  else if (data.event) insight = `market impact: ${data.event.name} (${data.event.desc})`;
  else if (data.weather.demandMultiplier > 1.2) insight = "weather patterns driving significant foot traffic.";

  const card = document.createElement("div");
  card.className = "report-card";

  let eventHtml = "";
  if (data.spawnedEvent) {
    eventHtml = `
      <div class="market-event">
        [!] MARKET: ${data.spawnedEvent.name}<br>
        <span style="color:#444; font-size:9px;">${data.spawnedEvent.desc}</span>
      </div>
    `;
  }

  card.innerHTML = `
    <div class="report-header">
      <span>#${gameState.shifts.toString().padStart(4, '0')}</span>
      <span style="color: ${!data.hasStock ? '#aa3333' : '#33ff33'}">${headline}</span>
    </div>
    <div class="report-body">
      ${insight}
    </div>
    <div class="report-metrics">
      <div class="report-metric">
        vol
        <span>${data.cups}</span>
      </div>
      <div class="report-metric">
        rev
        <span>${formatUsd(data.revenue)}</span>
      </div>
      <div class="report-metric">
        stock
        <span style="color: ${data.hasStock ? '#666' : '#aa3333'}">${data.hasStock ? 'OK' : 'EMPTY'}</span>
      </div>
    </div>
    ${eventHtml}
  `;

  container.insertBefore(card, container.firstChild);

  if (container.children.length > 20) {
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
    el.textContent = `weather: ${weatherState.condition.toLowerCase()} | demand: ${weatherState.demandLabel.toLowerCase()}`;
  }
}

// --- Upgrades UI ------------------------------------------------------------

function renderUpgrades() {
  const listEl = document.getElementById("upgradesList");
  if (!listEl) return;

  if (!isEligible) {
    listEl.innerHTML = '<div class="muted">connect wallet to see operations.</div>';
    return;
  }

  const currentTierUpgrades = upgrades.filter(
    u => u.tier === gameState.tierIndex && !u.owned
  );

  if (currentTierUpgrades.length === 0) {
    if (gameState.tierIndex === TIERS.length - 1) {
      listEl.innerHTML = '<div class="muted">you have reached the pinnacle of lemonade capitalism.</div>';
    } else {
      listEl.innerHTML = '<div class="muted">no operations available.</div>';
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
          <span class="upgrade-cost">${formatUsd(u.cost)}</span>
        </div>
        <div class="upgrade-desc">${u.desc}</div>
        <div class="token-cost-tag">burns ${(u.tokenCost || TOKEN_COSTS.buyUpgrade).toFixed(2)} $VV</div>
        <button class="${btnClass}" ${disabled} onclick="buyUpgrade('${u.id}')" style="width:100%">
          ${affordable ? '> BUY' : 'NEED CASH'}
        </button>
      </div>
    `;
  }).join("");
}

async function buyUpgrade(id) {
  const u = upgrades.find(x => x.id === id);
  if (!u || u.owned || gameState.cash < u.cost) return;
  if (txPending) return;

  const tokenCost = u.tokenCost || TOKEN_COSTS.buyUpgrade;
  const ok = await spendTokens(tokenCost, `upgrade:${id}`);
  if (!ok) return;

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

  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, w, h);

  const data = gameState.plHistory;
  if (data.length < 2) return;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  // Draw grid lines
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const y = (h / 5) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Draw data line
  ctx.beginPath();
  ctx.strokeStyle = "#33ff33";
  ctx.lineWidth = 1;

  data.forEach((val, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((val - min) / range) * (h - 16) - 8;
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
    msgEl.textContent = "ready. (costs 0.10 $VV)";
    btn.disabled = txPending;
  } else {
    msgEl.textContent = `wait ${(rem/1000).toFixed(1)}s`;
    btn.disabled = true;
  }
}

setInterval(updateCooldownUI, 100);

// --- Wallet -----------------------------------------------------------------

async function connectWallet() {
  // If already connected, treat as disconnect
  if (userAddress) {
    disconnectWallet();
    return;
  }

  if (!window.ethereum) {
    alert("No wallet found. Install MetaMask or a compatible wallet.");
    return;
  }

  try {
    provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    if (!accounts.length) return;

    signer = await provider.getSigner();
    userAddress = await signer.getAddress();

    // Create contract instance for both reading and writing
    tokenContract = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, provider);

    document.getElementById("walletAddress").textContent = shortenAddress(userAddress);
    document.getElementById("connectWalletButton").textContent = "DISCONNECT";
    document.getElementById("connectWalletButton").disabled = false;

    // Register wallet event listeners
    registerWalletEvents();

    await updateNetwork();
    await updateBalance();

    // Show welcome narrative on first connect
    if (!gameState.shownNarratives.includes("WELCOME")) {
      showNarrative("WELCOME");
    }
  } catch (err) {
    if (err.code === 4001 || err.code === "ACTION_REJECTED") {
      // User rejected connection request - do nothing
      return;
    }
    console.error("Wallet connection failed:", err);
    alert("Failed to connect wallet: " + (err.message || "Unknown error"));
  }
}

function disconnectWallet() {
  // Remove event listeners before clearing state
  unregisterWalletEvents();

  provider = null;
  signer = null;
  userAddress = null;
  tokenContract = null;
  lastChainId = null;
  lastBalance = 0;
  isEligible = false;

  document.getElementById("walletAddress").textContent = "disconnected";
  document.getElementById("tokenBalance").textContent = "-";
  document.getElementById("connectWalletButton").textContent = "CONNECT";

  const gateEl = document.getElementById("gateMessage");
  if (gateEl) {
    gateEl.style.display = "block";
    gateEl.innerHTML = `connect a wallet holding at least <strong>${REQUIRED_BALANCE.toLocaleString()} ${tokenSymbol}</strong> on base to play.`;
  }

  updateGameDisplay();
}

// --- Wallet Event Listeners (Fixes for wallet connect issues) ----------------

function registerWalletEvents() {
  if (!window.ethereum) return;

  window.ethereum.on("accountsChanged", handleAccountsChanged);
  window.ethereum.on("chainChanged", handleChainChanged);
  window.ethereum.on("disconnect", handleDisconnect);
}

function unregisterWalletEvents() {
  if (!window.ethereum) return;

  window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
  window.ethereum.removeListener("chainChanged", handleChainChanged);
  window.ethereum.removeListener("disconnect", handleDisconnect);
}

async function handleAccountsChanged(accounts) {
  if (!accounts || accounts.length === 0) {
    // User disconnected all accounts
    disconnectWallet();
    return;
  }

  // User switched to a different account
  const newAddress = accounts[0];
  if (newAddress.toLowerCase() !== (userAddress || "").toLowerCase()) {
    userAddress = newAddress;
    signer = await provider.getSigner();
    document.getElementById("walletAddress").textContent = shortenAddress(userAddress);
    await updateBalance();
  }
}

async function handleChainChanged(_chainId) {
  // Provider needs to be re-created after chain change
  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();
  tokenContract = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, provider);

  await updateNetwork();
  await updateBalance();
}

function handleDisconnect(error) {
  console.warn("Wallet disconnected:", error);
  disconnectWallet();
}

// --- Network & Balance -------------------------------------------------------

async function updateNetwork() {
  if (!provider) return;
  try {
    const net = await provider.getNetwork();
    lastChainId = net.chainId;
    const isBase = net.chainId === BASE_CHAIN_ID;
    document.getElementById("networkWarning").style.display = isBase ? "none" : "block";
    checkEligibility(lastBalance, isBase);
  } catch (err) {
    console.error("Network check failed:", err);
    document.getElementById("networkWarning").style.display = "block";
    checkEligibility(0, false);
  }
}

async function updateBalance() {
  if (!provider || !userAddress) return;
  try {
    const contract = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, provider);
    const bal = await contract.balanceOf(userAddress);
    const human = Number(ethers.formatUnits(bal, 18));
    lastBalance = human;
    document.getElementById("tokenBalance").textContent = human.toFixed(2);

    const net = await provider.getNetwork();
    checkEligibility(human, net.chainId === BASE_CHAIN_ID);
  } catch (err) {
    console.error("Balance check failed:", err);
    document.getElementById("tokenBalance").textContent = "error";
  }
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
  if (now - lastPriceFetch < 60000) return;
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
  return a.slice(0, 6) + "..." + a.slice(-4);
}

// --- Init -------------------------------------------------------------------

window.addEventListener("load", async () => {
  // Auto-reconnect if wallet was previously connected
  if (window.ethereum) {
    try {
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      if (accounts && accounts.length > 0) {
        await connectWallet();
      }
    } catch (err) {
      console.error("Auto-reconnect failed:", err);
    }
  }
  updateGameDisplay();
});
