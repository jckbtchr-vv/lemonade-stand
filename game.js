// Lemonade Stand – simple simulation gated by LEMON balance on Base
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

const gameState = {
  shifts: 0,
  cups: 0,
  customers: 0,
  hype: 1.0
};

// --- Game logic -------------------------------------------------------------

function updateGameDisplay() {
  const shiftsEl = document.getElementById("shifts");
  const cupsEl = document.getElementById("cups");
  const customersEl = document.getElementById("customers");
  const hypeEl = document.getElementById("hype");
  const runButton = document.getElementById("runButton");

  if (shiftsEl) shiftsEl.textContent = gameState.shifts.toString();
  if (cupsEl) cupsEl.textContent = gameState.cups.toString();
  if (customersEl) customersEl.textContent = gameState.customers.toString();
  if (hypeEl) hypeEl.textContent = `${gameState.hype.toFixed(1)}x`;

  if (runButton) {
    runButton.disabled = !isEligible;
    runButton.textContent = isEligible
      ? "Run Stand"
      : "Run Stand";
  }
}

function runStand() {
  if (!isEligible) return;

  gameState.shifts += 1;

  // Simple, deterministic growth: more hype = more output per shift
  const baseCupsPerShift = 5;
  const hypeBoost = Math.floor(gameState.hype); // extra cups from hype
  const cupsThisShift = baseCupsPerShift + hypeBoost + Math.floor(gameState.shifts / 5);
  const customersThisShift = cupsThisShift + 2;

  gameState.cups += cupsThisShift;
  gameState.customers += customersThisShift;

  // Hype slowly grows with total cups, but with diminishing returns
  gameState.hype = 1 + Math.log10(1 + gameState.cups) / 2;

  updateGameDisplay();
}

window.runStand = runStand;

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

// --- Init -------------------------------------------------------------------

window.addEventListener("load", () => {
  updateGameDisplay();

  // If wallet is already connected (MetaMask "connected site"), try to attach
  if (window.ethereum && window.ethereum.selectedAddress) {
    connectWallet().catch((e) =>
      console.warn("Auto-connect failed:", e)
    );
  }
});
