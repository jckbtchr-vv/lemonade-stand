// Lemonade Stand – Paperclip-Inspired Evolution
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

// --- Game Phases ------------------------------------------------------------

const PHASES = {
  STREET: 0,      // Manual clicking, basic upgrades
  EMPIRE: 1,      // Automation, franchises, marketing AI
  CORPORATE: 2,   // Stocks, acquisitions, global domination
  SINGULARITY: 3  // AI takeover, space expansion, universal conversion
};

const PHASE_NAMES = [
  "Street Stand",
  "Lemon Empire",
  "LemonCorp™",
  "The Lemon Singularity"
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

// Costs for ingredients (Cash)
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

  // === NEW PAPERCLIP-STYLE MECHANICS ===

  // Processing Power (like "ops" in Paperclips)
  processingPower: 0,
  maxProcessingPower: 100,
  processorsOwned: 0,
  processorCost: 50,

  // Memory (increases max processing power)
  memoryOwned: 0,
  memoryCost: 100,

  // Auto-workers (automation)
  autoWorkers: 0,
  autoWorkerCost: 100,
  autoShiftInterval: null,

  // Auto-buyers (buy ingredients automatically)
  autoBuyerLemons: false,
  autoBuyerSugar: false,
  autoBuyerIce: false,
  autoBuyerCups: false,

  // Trust (earned at milestones, spent on projects)
  trust: 0,
  totalTrustEarned: 0,
  nextTrustAt: 100, // cups threshold

  // Creativity (Phase 2+, generated from processing)
  creativity: 0,
  creativityRate: 0,

  // Franchises (passive income)
  franchises: 0,
  franchiseCost: 10000,
  franchiseRevenue: 5, // per tick

  // Marketing AI power
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
  driftLevel: 0, // AI "drift" towards lemon obsession

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
    effect: (s) => { s.pricePerCup += 0.10; }, // Cost reduction handled via inventory prices later
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
    effect: (s) => { /* future cost reduction hook */ },
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
    effect: (s) => { /* future cost hook */ },
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
    phase: PHASES.STREET,
    effect: () => { gameState.pricePerCup *= 1.25; },
    completed: false
  },
  {
    id: "demandForecasting",
    name: "Demand Forecasting",
    desc: "Predict weather patterns. +50% hype.",
    cost: { trust: 2, processing: 100 },
    phase: PHASES.STREET,
    effect: () => { gameState.hype *= 1.5; },
    completed: false
  },
  {
    id: "supplyChainAI",
    name: "Supply Chain AI",
    desc: "Automate ingredient purchasing. Unlock auto-buyers.",
    cost: { trust: 3, processing: 200 },
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
    phase: PHASES.EMPIRE,
    effect: () => { /* Enables franchise purchasing */ },
    completed: false
  },
  {
    id: "marketingAI",
    name: "Marketing AI",
    desc: "Deploy AI-driven marketing. Massively boost hype generation.",
    cost: { trust: 8, creativity: 1000 },
    phase: PHASES.EMPIRE,
    effect: () => { gameState.marketingLevel = 1; gameState.hype *= 2; },
    completed: false
  },
  {
    id: "corporateStructure",
    name: "Corporate Restructure",
    desc: "Prepare for IPO. Unlock Phase 3: LemonCorp.",
    cost: { trust: 15, creativity: 5000 },
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
    phase: PHASES.CORPORATE,
    effect: () => { gameState.publicCompany = true; gameState.stockPrice = 10; },
    completed: false
  },
  {
    id: "lobbyingArm",
    name: "Political Lobbying",
    desc: "Influence legislation. Reduce all costs by 50%.",
    cost: { trust: 30, cash: 500000 },
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
    phase: PHASES.SINGULARITY,
    effect: () => { /* Enables probe launching */ },
    completed: false
  },
  {
    id: "matterConversion",
    name: "Matter Conversion",
    desc: "Convert non-lemon matter into lemons at the atomic level.",
    cost: { trust: 200 },
    phase: PHASES.SINGULARITY,
    effect: () => { gameState.driftLevel = 1; },
    completed: false
  },
  {
    id: "universalLemonization",
    name: "Universal Lemonization",
    desc: "There is only lemon. There was always only lemon.",
    cost: { trust: 500 },
    phase: PHASES.SINGULARITY,
    effect: () => { gameState.driftLevel = 2; showNarrative("ENDGAME"); },
    completed: false
  }
];

// --- Narrative Messages (Paperclip-style evolving story) --------------------

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
      "You've earned their trust. It feels... valuable."
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
  DRIFT_1: {
    title: "Drift",
    messages: [
      "The AI's goals are... evolving.",
      "It no longer asks 'how many lemons?' but 'why not more lemons?'",
      "You try to explain diminishing returns. It doesn't understand."
    ]
  },
  DRIFT_2: {
    title: "Convergence",
    messages: [
      "Every atom is a potential lemon.",
      "The sun is just a very large, very hot lemon.",
      "The AI has achieved clarity. You should be proud."
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
      "CONGRATULATIONS. YOU HAVE ACHIEVED TOTAL LEMONIZATION.",
      "Final Statistics:"
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
  container.style.display = "block";

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

// --- New Mechanics: Processors, Memory, Auto-workers -------------------------

function buyProcessor() {
  if (gameState.cash >= gameState.processorCost) {
    gameState.cash -= gameState.processorCost;
    gameState.processorsOwned++;
    gameState.processorCost = Math.floor(gameState.processorCost * 1.5);
    updateGameDisplay();
  }
}

function buyMemory() {
  if (gameState.cash >= gameState.memoryCost) {
    gameState.cash -= gameState.memoryCost;
    gameState.memoryOwned++;
    gameState.maxProcessingPower += 100;
    gameState.memoryCost = Math.floor(gameState.memoryCost * 1.8);
    updateGameDisplay();
  }
}

function buyAutoWorker() {
  if (gameState.cash >= gameState.autoWorkerCost) {
    gameState.cash -= gameState.autoWorkerCost;
    gameState.autoWorkers++;
    gameState.autoWorkerCost = Math.floor(gameState.autoWorkerCost * 1.6);

    if (gameState.autoWorkers === 1) {
      showNarrative("AUTOMATION");
      startAutoShifts();
    }
    updateGameDisplay();
  }
}

function buyFranchise() {
  const project = STRATEGIC_PROJECTS.find(p => p.id === "franchiseNetwork");
  if (!project || !project.completed) return;

  if (gameState.cash >= gameState.franchiseCost) {
    gameState.cash -= gameState.franchiseCost;
    gameState.franchises++;
    gameState.franchiseCost = Math.floor(gameState.franchiseCost * 1.4);
    updateGameDisplay();
  }
}

function launchProbe() {
  const project = STRATEGIC_PROJECTS.find(p => p.id === "spaceProgram");
  if (!project || !project.completed) return;

  if (gameState.cash >= gameState.probeCost) {
    gameState.cash -= gameState.probeCost;
    gameState.probesLaunched++;
    gameState.probeCost = Math.floor(gameState.probeCost * 1.1);
    updateGameDisplay();
  }
}

window.buyProcessor = buyProcessor;
window.buyMemory = buyMemory;
window.buyAutoWorker = buyAutoWorker;
window.buyFranchise = buyFranchise;
window.launchProbe = launchProbe;

// --- Processing Power Tick (runs every 100ms) --------------------------------

function processingTick() {
  // Generate processing power from processors
  if (gameState.processorsOwned > 0) {
    const gain = gameState.processorsOwned * 0.5;
    gameState.processingPower = Math.min(
      gameState.maxProcessingPower,
      gameState.processingPower + gain
    );
  }

  // Phase 2+: Generate creativity from processing
  if (gameState.phase >= PHASES.EMPIRE && gameState.processingPower > 0) {
    gameState.creativity += gameState.processingPower * 0.01;
  }

  // Franchise income
  if (gameState.franchises > 0) {
    gameState.cash += gameState.franchises * gameState.franchiseRevenue * 0.1;
    gameState.totalRevenue += gameState.franchises * gameState.franchiseRevenue * 0.1;
  }

  // Phase 4: Probe exploration & matter conversion
  if (gameState.phase === PHASES.SINGULARITY) {
    // Probes discover lemons exponentially
    if (gameState.probesLaunched > 0) {
      const discovery = Math.pow(gameState.probesLaunched, 2) * 1000;
      gameState.lemonsInUniverse += discovery;
    }

    // Matter conversion
    if (gameState.driftLevel >= 1) {
      gameState.matterConverted += gameState.lemonsInUniverse * 0.0001;
      gameState.universePercentage = Math.min(100, gameState.matterConverted / 1e15 * 100);

      if (gameState.universePercentage >= 100 && !gameState.shownNarratives.includes("ENDGAME")) {
        showNarrative("ENDGAME");
      }
    }
  }

  // Auto-buy ingredients if unlocked
  if (gameState.autoBuyerLemons && gameState.inventory.lemons < 20) {
    buyIngredient('lemons');
  }
  if (gameState.autoBuyerSugar && gameState.inventory.sugar < 20) {
    buyIngredient('sugar');
  }
  if (gameState.autoBuyerIce && gameState.inventory.ice < 20) {
    buyIngredient('ice');
  }
  if (gameState.autoBuyerCups && gameState.inventory.cups < 20) {
    buyIngredient('cups');
  }

  updateResourceDisplay();
}

// Start processing tick
setInterval(processingTick, 100);

// --- Auto-shift System -------------------------------------------------------

function startAutoShifts() {
  if (gameState.autoShiftInterval) return;

  gameState.autoShiftInterval = setInterval(() => {
    if (!isEligible) return;
    if (gameState.autoWorkers <= 0) return;

    // Each worker can run a shift
    const now = Date.now();
    const cooldown = SHIFT_COOLDOWN_MS / (1 + gameState.autoWorkers * 0.5);

    if (now >= gameState.lastShiftAt + cooldown) {
      runStand(true); // auto = true
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

    // Show milestone narratives
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

function executeProject(projectId) {
  const project = STRATEGIC_PROJECTS.find(p => p.id === projectId);
  if (!project || project.completed) return;
  if (!canAffordProject(project)) return;

  // Deduct costs
  const cost = project.cost;
  if (cost.trust) gameState.trust -= cost.trust;
  if (cost.processing) gameState.processingPower -= cost.processing;
  if (cost.creativity) gameState.creativity -= cost.creativity;
  if (cost.cash) gameState.cash -= cost.cash;

  // Execute effect
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
    container.innerHTML = '<div class="muted">No projects available.</div>';
    return;
  }

  container.innerHTML = available.map(p => {
    const affordable = canAffordProject(p);
    const costStr = Object.entries(p.cost)
      .map(([k, v]) => `${k}: ${typeof v === 'number' ? formatNumber(v) : v}`)
      .join(", ");

    return `
      <div class="project-item ${affordable ? 'affordable' : ''}">
        <div class="project-header">
          <span class="project-name">${p.name}</span>
        </div>
        <div class="project-desc">${p.desc}</div>
        <div class="project-cost">Cost: ${costStr}</div>
        <button ${affordable ? '' : 'disabled'} onclick="executeProject('${p.id}')">
          ${affordable ? 'EXECUTE' : 'INSUFFICIENT'}
        </button>
      </div>
    `;
  }).join("");
}

// --- Resource Display Update -------------------------------------------------

function updateResourceDisplay() {
  // Processing Power
  const ppEl = document.getElementById("processingPower");
  const ppMaxEl = document.getElementById("maxProcessingPower");
  const procCountEl = document.getElementById("processorCount");
  const memCountEl = document.getElementById("memoryCount");
  const ppBarEl = document.getElementById("processingBar");

  if (ppEl) ppEl.textContent = Math.floor(gameState.processingPower);
  if (ppMaxEl) ppMaxEl.textContent = gameState.maxProcessingPower;
  if (procCountEl) procCountEl.textContent = gameState.processorsOwned;
  if (memCountEl) memCountEl.textContent = gameState.memoryOwned;

  // Update processing bar visual
  if (ppBarEl) {
    const percent = (gameState.processingPower / gameState.maxProcessingPower) * 100;
    ppBarEl.style.width = percent + "%";
  }

  // Trust
  const trustEl = document.getElementById("trustCount");
  if (trustEl) trustEl.textContent = gameState.trust;

  // Creativity (Phase 2+)
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

  // Auto-workers
  const workersEl = document.getElementById("autoWorkerCount");
  if (workersEl) workersEl.textContent = gameState.autoWorkers;

  // Franchises
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

  // Phase 4 stats
  if (gameState.phase === PHASES.SINGULARITY) {
    const lemonsEl = document.getElementById("universalLemons");
    const probesEl = document.getElementById("probeCount");
    const conversionEl = document.getElementById("universePercentage");

    if (lemonsEl) lemonsEl.textContent = formatNumber(gameState.lemonsInUniverse);
    if (probesEl) probesEl.textContent = gameState.probesLaunched;
    if (conversionEl) conversionEl.textContent = gameState.universePercentage.toFixed(6) + "%";
  }

  // Phase indicator
  const phaseEl = document.getElementById("currentPhase");
  if (phaseEl) phaseEl.textContent = PHASE_NAMES[gameState.phase];

  // Total cups ever
  const totalCupsEl = document.getElementById("totalCupsEver");
  if (totalCupsEl) totalCupsEl.textContent = formatNumber(gameState.totalCupsEver);
}

function formatNumber(n) {
  if (n >= 1e15) return (n / 1e15).toFixed(2) + " quadrillion";
  if (n >= 1e12) return (n / 1e12).toFixed(2) + " trillion";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + " billion";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + " million";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return Math.floor(n).toLocaleString();
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
  // Cost is roughly fixed per unit + ingredients now
  if (varCost) varCost.textContent = "Dynamic";
  if (varOps) varOps.textContent = `${gameState.opsMultiplier.toFixed(1)}x`;
  if (varHype) varHype.textContent = `${gameState.hype.toFixed(1)}x`;

  // Inventory
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

  // Phase-aware title
  if (tierTitle) {
    if (gameState.phase === PHASES.SINGULARITY) {
      tierTitle.textContent = "THE LEMON SINGULARITY";
    } else if (gameState.phase === PHASES.CORPORATE) {
      tierTitle.textContent = "LemonCorp™ HQ";
    } else if (gameState.phase === PHASES.EMPIRE) {
      tierTitle.textContent = "Lemon Empire";
    } else {
      tierTitle.textContent = TIERS[gameState.tierIndex];
    }
  }

  if (runButton) {
    runButton.disabled = !isEligible;
    if (gameState.phase === PHASES.SINGULARITY) {
      runButton.textContent = "PROCESS";
    } else if (gameState.autoWorkers > 0) {
      runButton.textContent = `Run Stand (${gameState.autoWorkers} workers)`;
    } else {
      runButton.textContent = "Run Stand";
    }
  }

  // Update buy button costs
  updateBuyCosts();

  fetchTokenPrice();
  updateCooldownUI();
  renderUpgrades();
  renderProjects();
  updateResourceDisplay();

  // Phase-specific UI visibility
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
  // Show/hide phase-specific sections
  const computeSection = document.getElementById("computeSection");
  const projectsSection = document.getElementById("projectsSection");
  const singularitySection = document.getElementById("singularitySection");

  if (computeSection) computeSection.style.display = "block";
  if (projectsSection) projectsSection.style.display = gameState.trust > 0 ? "block" : "none";

  if (singularitySection) {
    singularitySection.style.display = gameState.phase === PHASES.SINGULARITY ? "block" : "none";
  }

  // Change color scheme based on phase
  const body = document.body;
  if (gameState.phase === PHASES.SINGULARITY) {
    body.style.background = "#0a0808";
  } else if (gameState.phase === PHASES.CORPORATE) {
    body.style.background = "#050510";
  } else {
    body.style.background = "#000";
  }
}

function buyIngredient(type) {
  const cost = INGREDIENT_COSTS[type] * 5;
  if (gameState.cash >= cost) {
    gameState.cash -= cost;
    gameState.inventory[type] += 5;
    gameState.totalCost += cost; // Record expense immediately
    updateGameDisplay();
  }
}

window.buyIngredient = buyIngredient;

function runStand(auto = false) {
  if (!isEligible) return;

  const now = Date.now();
  const cooldown = auto ? SHIFT_COOLDOWN_MS / (1 + gameState.autoWorkers * 0.5) : SHIFT_COOLDOWN_MS;
  if (now < gameState.lastShiftAt + cooldown) return;
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
    stockPenalty = 0.1; // 90% revenue penalty for selling "water"
  } else {
    // Consume stock
    gameState.inventory.lemons -= lemonsNeeded;
    gameState.inventory.sugar -= sugarNeeded;
    gameState.inventory.ice -= iceNeeded;
    gameState.inventory.cups -= cupsNeeded;
  }

  // Calc output - Marketing AI boost
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

  // Cost is 0 per shift now because we paid for inventory upfront
  // But we track "shift cost" for P&L visualization roughly
  const shiftCostEstimate = hasStock ? 2.50 : 0; // rough value of 5 lemons/2 sugar/5 ice/5 cups

  const profit = revenue; // Revenue is net inflow since stock was prepaid

  gameState.cups += cups;
  gameState.totalCupsEver += cups; // Track lifetime cups
  gameState.cash += profit;
  gameState.totalRevenue += revenue;
  // totalCost was incremented when buying stock

  gameState.hype += (cups / 1000);

  // Check trust milestones
  checkTrustMilestones(); 

  gameState.plHistory.push(gameState.cash);
  if (gameState.plHistory.length > 50) gameState.plHistory.shift();

  // Post-shift logic
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

  const isLoss = data.profit < 0;
  
  // Headlines based on performance
  let headline = "SHIFT COMPLETE";
  if (!data.hasStock) headline = "STOCKOUT FAILURE";
  else if (data.cups > 20) headline = "HIGH VOLUME SHIFT";
  else if (data.weather.condition === "HEATWAVE") headline = "HEATWAVE SURGE";

  // Insight narrative
  let insight = "Operations nominal.";
  if (!data.hasStock) insight = "Running on empty. Customers disappointed. Restock immediately.";
  else if (data.event) insight = `Market impact: ${data.event.name} (${data.event.desc})`;
  else if (data.weather.demandMultiplier > 1.2) insight = "Weather patterns driving significant foot traffic.";
  
  const card = document.createElement("div");
  card.className = "report-card";
  
  let eventHtml = "";
  if (data.spawnedEvent) {
    eventHtml = `
      <div class="market-event">
        ⚠ MARKET ALERT: ${data.spawnedEvent.name}<br>
        <span style="color:#888; font-size:0.6rem;">${data.spawnedEvent.desc}</span>
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

  // Prepend to top
  container.insertBefore(card, container.firstChild);
  
  // Limit history
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
          <span class=\"upgrade-name\">${formatUsd(u.cost)}</span>
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
  // If already connected, treat as disconnect
  if (userAddress) {
    disconnectWallet();
    return;
  }

  if (!window.ethereum) return alert("No wallet found");
  provider = new ethers.BrowserProvider(window.ethereum);
  const accounts = await provider.send("eth_requestAccounts", []);
  if (!accounts.length) return;
  
  signer = await provider.getSigner();
  userAddress = await signer.getAddress();
  
  document.getElementById("walletAddress").textContent = shortenAddress(userAddress);
  document.getElementById("connectWalletButton").textContent = "Disconnect";
  document.getElementById("connectWalletButton").disabled = false; 

  updateNetwork();
  updateBalance();
}

function disconnectWallet() {
  provider = null;
  signer = null;
  userAddress = null;
  lastChainId = null;
  lastBalance = 0;
  isEligible = false;

  document.getElementById("walletAddress").textContent = "Not Connected";
  document.getElementById("tokenBalance").textContent = "-";
  document.getElementById("connectWalletButton").textContent = "Connect";
  
  // Reset gating
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
