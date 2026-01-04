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

// Expose to window for inline onclick
window.runStand = runStand;

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

// --- Helpers ----------------------------------------------------------------

function shortenAddress(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

// --- Init -------------------------------------------------------------------

window.addEventListener("load", () => {
  updateSimDisplay();

  // If wallet is already connected (MetaMask "connected site"), try to attach
  if (window.ethereum && window.ethereum.selectedAddress) {
    connectWallet().catch((e) =>
      console.warn("Auto-connect failed:", e)
    );
  }
});
