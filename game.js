// Lemonade Stand – spend-only simulation with Base L2 token balance
// Token address (Base): 0xd2969cc475a49e73182ae1c517add57db0f1c2ac

// --- Config -----------------------------------------------------------------

const BASE_CHAIN_ID = 8453n;
const TOKEN_ADDRESS = "0xd2969cc475a49e73182ae1c517add57db0f1c2ac";

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
let tokenSymbol = "TOKEN";

// --- Simulation state -------------------------------------------------------

const simState = {
  plays: 0,
  simulatedUnitCost: 1.0,     // 1.0 "unit" per run (purely illustrative)
  simulatedUnitsSpent: 0.0,   // accumulates; never turns into anything
  cupsProduced: 0,
  cupsSold: 0
};

// --- Simulated stake gate (for design/testing) -----------------------------

const STAKE_THRESHOLD = 1000; // LEMON required to unlock advanced systems (simulated)
let simulatedStake = 0;

// --- Token analytics state (price chart + activity) ------------------------

let priceHistory = []; // Array<{ timestamp: number, price: number }>

// --- Simulation logic -------------------------------------------------------

function updateSimDisplay() {
  const spendEl = document.getElementById("simulatedSpend");
  const playsEl = document.getElementById("plays");
  const producedEl = document.getElementById("cupsProduced");
  const soldEl = document.getElementById("cupsSold");
  const runButton = document.getElementById("runButton");

  if (!spendEl) return;

  spendEl.textContent = simState.simulatedUnitsSpent.toFixed(2);
  playsEl.textContent = simState.plays.toString();
  producedEl.textContent = simState.cupsProduced.toString();
  soldEl.textContent = simState.cupsSold.toString();

  if (runButton) {
    runButton.textContent = `Run Stand · Spend ${simState.simulatedUnitCost.toFixed(
      2
    )} Unit (Simulated)`;
  }

  // Advanced metrics depend on current sim state
  updateStakeUI();
}

// One "turn": spend some units, produce and sell cups as a pure score
function runStand() {
  simState.plays += 1;
  simState.simulatedUnitsSpent += simState.simulatedUnitCost;

  // Simple deterministic-ish production model for clarity:
  // Each run produces 4 cups and sells 3 (the rest is "waste").
  const producedThisTurn = 4;
  const soldThisTurn = 3;

  simState.cupsProduced += producedThisTurn;
  simState.cupsSold += soldThisTurn;

  updateSimDisplay();
}

// Simulate staking to explore UX without touching real balances
function simulateStake(delta) {
  simulatedStake = Math.max(0, simulatedStake + delta);
  updateStakeUI();
}

function updateStakeUI() {
  const thresholdEl = document.getElementById("stakeThreshold");
  const currentStakeEl = document.getElementById("currentStake");
  const advancedPanel = document.getElementById("advancedSystems");

  if (thresholdEl) {
    thresholdEl.textContent = STAKE_THRESHOLD.toLocaleString();
  }
  if (currentStakeEl) {
    currentStakeEl.textContent = Math.max(0, simulatedStake).toLocaleString();
  }

  const unlocked = simulatedStake >= STAKE_THRESHOLD;
  if (advancedPanel) {
    advancedPanel.style.display = unlocked ? "block" : "none";
  }

  if (unlocked) {
    updateAdvancedMetrics();
  }
}

function updateAdvancedMetrics() {
  const efficiencyEl = document.getElementById("efficiencyMetric");
  const scaleEl = document.getElementById("scaleMetric");
  const saturationEl = document.getElementById("saturationMetric");
  const innovationEl = document.getElementById("innovationMetric");

  const plays = simState.plays;
  const produced = simState.cupsProduced;
  const sold = simState.cupsSold;

  // Efficiency: how many cups sold vs produced
  let efficiency = produced > 0 ? (sold / produced) * 100 : 0;
  efficiency = Math.max(0, Math.min(100, efficiency));

  // Scale: log of total output + stake
  const rawScale = Math.log10(1 + sold + simulatedStake);
  const scale = (rawScale * 10).toFixed(1);

  // Saturation: more plays gradually approaches 100
  const saturation = Math.min(100, (plays / (plays + 20)) * 100);

  // Innovation: mix of relative stake and experimentation (plays)
  const stakeFactor = Math.min(1, simulatedStake / STAKE_THRESHOLD);
  const playFactor = Math.min(1, plays / 200);
  const innovation = (stakeFactor * 60 + playFactor * 40);

  if (efficiencyEl) {
    efficiencyEl.textContent = `${efficiency.toFixed(1)}%`;
  }
  if (scaleEl) {
    scaleEl.textContent = `${scale}x`;
  }
  if (saturationEl) {
    saturationEl.textContent = `${saturation.toFixed(1)}%`;
  }
  if (innovationEl) {
    innovationEl.textContent = `${innovation.toFixed(1)}%`;
  }
}

// Expose to window for inline onclick
window.runStand = runStand;
window.simulateStake = simulateStake;

// --- Wallet + token balance (read-only) ------------------------------------

async function connectWallet() {
  try {
    if (!window.ethereum) {
      alert("No Ethereum provider found. Please install MetaMask or a compatible wallet.");
      return;
    }

    // Ethers v6 BrowserProvider
    provider = new ethers.BrowserProvider(window.ethereum);

    // Request accounts
    const accounts = await provider.send("eth_requestAccounts", []);
    if (!accounts || accounts.length === 0) {
      return;
    }

    signer = await provider.getSigner();
    userAddress = await signer.getAddress();

    // Update address display
    const addrEl = document.getElementById("walletAddress");
    if (addrEl) {
      addrEl.textContent = shortenAddress(userAddress);
    }

    // Show network info
    await updateNetworkInfo();

    // Load token metadata + balance
    await loadTokenMetadataAndBalance();

    const connectButton = document.getElementById("connectWalletButton");
    if (connectButton) {
      connectButton.textContent = "Wallet Connected";
      connectButton.disabled = true;
    }
  } catch (err) {
    console.error("connectWallet error", err);
    alert("Failed to connect wallet. Check the console for details.");
  }
}

async function updateNetworkInfo() {
  if (!provider) return;

  try {
    const network = await provider.getNetwork();
    const nameEl = document.getElementById("networkName");
    const warningEl = document.getElementById("networkWarning");

    if (nameEl) {
      const chainId = network.chainId;
      nameEl.textContent = `chainId: ${chainId.toString()}`;
    }

    const isBase = network.chainId === BASE_CHAIN_ID;
    if (warningEl) {
      warningEl.style.display = isBase ? "none" : "block";
    }
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

    const humanBalance = Number(
      ethers.formatUnits(rawBalance, tokenDecimals)
    );

    const balanceEl = document.getElementById("tokenBalance");
    if (balanceEl) {
      balanceEl.textContent = `${humanBalance.toFixed(4)} ${tokenSymbol}`;
    }
  } catch (err) {
    console.error("loadTokenMetadataAndBalance error", err);
    const balanceEl = document.getElementById("tokenBalance");
    if (balanceEl) {
      balanceEl.textContent = "Error loading balance";
    }
  }
}

window.connectWallet = connectWallet;

// --- Token analytics (DexScreener) -----------------------------------------

async function fetchTokenAnalytics() {
  const statusEl = document.getElementById("chartStatus");

  try {
    if (statusEl) {
      statusEl.textContent = "Loading DexScreener data…";
    }

    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${TOKEN_ADDRESS}`
    );
    const data = await res.json();

    const pair = data && Array.isArray(data.pairs) && data.pairs.length > 0
      ? data.pairs[0]
      : null;

    if (!pair || !pair.priceUsd) {
      if (statusEl) {
        statusEl.textContent = "No price data available";
      }
      return;
    }

    const price = parseFloat(pair.priceUsd) || 0;
    const change24h = parseFloat(pair.priceChange24h || 0);
    const volume24h = parseFloat(pair.volume24h || 0);

    updatePriceMeta(price, change24h, volume24h);
    updatePriceHistory(price, change24h);
    drawPriceChart(price, change24h);
    updateRecentActivity(volume24h, price);

    if (statusEl) {
      statusEl.textContent = "";
    }
  } catch (err) {
    console.error("fetchTokenAnalytics error", err);
    if (statusEl) {
      statusEl.textContent = "Error loading price data";
    }
  }
}

function updatePriceMeta(price, change24h, volume24h) {
  const priceEl = document.getElementById("priceUsd");
  const changeEl = document.getElementById("priceChange");
  const volumeEl = document.getElementById("priceVolume");

  if (priceEl) {
    priceEl.textContent = price > 0 ? `$${price.toFixed(8)}` : "-";
  }

  if (changeEl) {
    const sign = change24h > 0 ? "+" : "";
    changeEl.textContent = isFinite(change24h)
      ? `${sign}${change24h.toFixed(2)}%`
      : "-";
    if (isFinite(change24h)) {
      changeEl.style.color = change24h >= 0 ? "#00ff00" : "#ff4444";
    }
  }

  if (volumeEl) {
    volumeEl.textContent = formatCompactUsd(volume24h);
  }
}

function updatePriceHistory(currentPrice, change24h) {
  const POINTS = 48; // 24h at 30m resolution

  if (priceHistory.length === 0) {
    // Seed synthetic 24h history around current price
    const now = Date.now();
    const startPrice = currentPrice / (1 + (change24h || 0) / 100);
    const intervalMs = (24 * 60 * 60 * 1000) / POINTS;

    let lastPrice = startPrice;
    for (let i = 0; i < POINTS; i++) {
      const t = now - (POINTS - 1 - i) * intervalMs;
      const drift = (currentPrice - startPrice) * (i / (POINTS - 1));
      const noise = lastPrice * (Math.random() - 0.5) * 0.04; // ±4%
      let price = Math.max(0, lastPrice + drift + noise);
      if (!isFinite(price) || price <= 0) price = lastPrice || currentPrice;
      priceHistory.push({ timestamp: t, price });
      lastPrice = price;
    }
  } else {
    // Append latest point
    priceHistory.push({ timestamp: Date.now(), price: currentPrice });
    if (priceHistory.length > POINTS) {
      priceHistory = priceHistory.slice(-POINTS);
    }
  }
}

function drawPriceChart(currentPrice, change24h) {
  const canvas = document.getElementById("priceChart");
  const statusEl = document.getElementById("chartStatus");
  if (!canvas || priceHistory.length < 2) {
    if (statusEl) {
      statusEl.textContent = priceHistory.length < 2
        ? "Collecting data…"
        : "No chart available";
    }
    return;
  }

  const ctx = canvas.getContext("2d");
  const width = (canvas.width = canvas.clientWidth || 300);
  const height = (canvas.height = 140);

  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, width, height);

  const prices = priceHistory.map((p) => p.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice || 1;

  const padding = 10;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;

  // Grid lines
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = padding + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  // Price line
  ctx.strokeStyle = change24h >= 0 ? "#00ff00" : "#ff4444";
  ctx.lineWidth = 1.5;
  ctx.beginPath();

  priceHistory.forEach((point, idx) => {
    const x = padding + (idx / (priceHistory.length - 1 || 1)) * chartW;
    const y =
      padding + (1 - (point.price - minPrice) / range) * chartH;
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();
}

function updateRecentActivity(volume24h, currentPrice) {
  const listEl = document.getElementById("txList");
  if (!listEl) return;

  const txs = generateSimulatedTxs(volume24h, currentPrice);
  if (!txs.length) {
    listEl.innerHTML = '<div class="muted">No activity simulated.</div>';
    return;
  }

  listEl.innerHTML = txs
    .map((tx) => {
      const color = tx.type === "BUY" ? "#00ff00" : "#ff4444";
      return `
        <div class="tx-row" style="color:${color}">
          <span>${tx.type}</span>
          <span>$${tx.value.toFixed(2)}</span>
          <span>$${tx.price.toFixed(6)}</span>
          <span>${formatTimeAgo(tx.secondsAgo)}</span>
        </div>
        <div class="tx-hash">${tx.hash}</div>
      `;
    })
    .join("");
}

function generateSimulatedTxs(volume24h, currentPrice) {
  const txs = [];
  if (!isFinite(volume24h) || volume24h <= 0 || !isFinite(currentPrice) || currentPrice <= 0) {
    return txs;
  }

  const avgTxUsd = volume24h / 40; // assume ~40 trades/day
  const count = Math.min(20, Math.max(5, Math.floor(volume24h / avgTxUsd)));

  for (let i = 0; i < count; i++) {
    const type = Math.random() > 0.5 ? "BUY" : "SELL";
    const sizeMul = 0.25 + Math.random() * 1.5; // 0.25x–1.75x
    const value = avgTxUsd * sizeMul;
    const priceMul = 0.98 + Math.random() * 0.04; // ±2%
    const price = currentPrice * priceMul;
    const secondsAgo = Math.floor(Math.random() * 60 * 60); // last hour

    txs.push({
      type,
      value,
      price,
      secondsAgo,
      hash: generateMockHash()
    });
  }

  // Most recent first
  txs.sort((a, b) => a.secondsAgo - b.secondsAgo);
  return txs;
}

function generateMockHash() {
  const chars = "0123456789abcdef";
  let h = "0x";
  for (let i = 0; i < 10; i++) {
    h += chars[Math.floor(Math.random() * chars.length)];
  }
  return h;
}

// --- Helpers ----------------------------------------------------------------

function shortenAddress(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function formatTimeAgo(seconds) {
  if (!isFinite(seconds) || seconds < 0) return "";
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function formatCompactUsd(value) {
  if (!isFinite(value) || value <= 0) return "-";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

// --- Init -------------------------------------------------------------------

window.addEventListener("load", () => {
  updateSimDisplay();
  updateStakeUI();

  // Kick off token analytics polling (does not depend on wallet)
  fetchTokenAnalytics();
  setInterval(fetchTokenAnalytics, 60_000); // refresh every 60s

  // If wallet is already connected (MetaMask "connected site"), try to attach
  if (window.ethereum && window.ethereum.selectedAddress) {
    connectWallet().catch((e) =>
      console.warn("Auto-connect failed:", e)
    );
  }
});
