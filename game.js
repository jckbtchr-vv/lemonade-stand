// Lemonade Stand — burn $VV to play
// Token: $VV on Base (0xd2969cc475a49e73182ae1c517add57db0f1c2ac)
// No fake currency. All prices in real $VV tokens.

const BASE_CHAIN_ID = 8453;
const TOKEN_ADDRESS = "0xd2969cc475a49e73182ae1c517add57db0f1c2ac";
const REQUIRED_BALANCE = 1000;
const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address, uint256) returns (bool)"
];
const COOLDOWN = 3000;

// --- wallet state ---

let provider = null;
let signer = null;
let userAddress = null;
let tokenContract = null;
let tokenDecimals = 18;
let lastBalance = 0;
let isEligible = false;
let txPending = false;

// --- game state ---

const state = {
  lemons: 0,
  totalCups: 0,
  vvBurned: 0,
  multiplier: 1.0,
  weather: "--",
  weatherMult: 1.0,
  lastRun: 0,
  shifts: 0,
  passiveCups: 0,
  log: []
};

// --- upgrades (all priced in $VV only) ---

const UPGRADES = [
  { id: "cups",   name: "Better Cups",  desc: "1.5x output",          vv: 0.50,  apply: function() { state.multiplier *= 1.5; } },
  { id: "cooler", name: "Ice Cooler",   desc: "1.5x output",          vv: 1.00,  apply: function() { state.multiplier *= 1.5; } },
  { id: "stand2", name: "Second Stand", desc: "2x output",            vv: 2.00,  apply: function() { state.multiplier *= 2; } },
  { id: "sign",   name: "Neon Sign",    desc: "1.5x output",          vv: 3.00,  apply: function() { state.multiplier *= 1.5; } },
  { id: "truck",  name: "Food Truck",   desc: "2x output",            vv: 5.00,  apply: function() { state.multiplier *= 2; } },
  { id: "bill",   name: "Billboard",    desc: "2x output",            vv: 8.00,  apply: function() { state.multiplier *= 2; } },
  { id: "franch", name: "Franchise",    desc: "+10 cups/sec passive",  vv: 15.00, apply: function() { state.passiveCups += 10; } }
];

const owned = new Set();

// --- token burn ---

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

async function burn(amount, action) {
  if (!signer || !tokenContract || !isEligible) return false;
  if (amount <= 0) return true;
  if (lastBalance < amount) return false;

  try {
    showTx("Burning " + amount.toFixed(2) + " $VV...");
    var w = tokenContract.connect(signer);
    var wei = ethers.parseUnits(amount.toFixed(4), tokenDecimals);
    var tx = await w.transfer(BURN_ADDRESS, wei);
    showTx("Confirming...");
    await tx.wait();
    state.vvBurned += amount;
    refreshBalance();
    hideTx();
    return true;
  } catch (err) {
    hideTx();
    if (err.code === "ACTION_REJECTED" || err.code === 4001) return false;
    console.error("Burn failed (" + action + "):", err);
    return false;
  }
}

// --- game actions ---

async function buyLemons() {
  if (txPending) return;
  var ok = await burn(0.10, "buyLemons");
  if (!ok) return;
  state.lemons += 10;
  render();
}

async function runStand() {
  if (!isEligible || txPending) return;
  if (Date.now() < state.lastRun + COOLDOWN) return;

  var ok = await burn(0.10, "runStand");
  if (!ok) return;

  state.lastRun = Date.now();
  state.shifts++;
  rollWeather();

  var used = Math.min(state.lemons, 10);
  state.lemons -= used;

  if (used === 0) {
    addLog(state.weather, 0, "no lemons!");
    render();
    return;
  }

  var cups = Math.max(1, Math.round(used * 2 * state.multiplier * state.weatherMult));
  state.totalCups += cups;

  addLog(state.weather, cups);
  render();
}

async function buyUpgrade(id) {
  var u = UPGRADES.find(function(x) { return x.id === id; });
  if (!u || owned.has(id) || txPending) return;

  var ok = await burn(u.vv, "upgrade:" + id);
  if (!ok) return;

  owned.add(id);
  u.apply();
  render();
}

// --- weather ---

function rollWeather() {
  var r = Math.random();
  if (r < 0.15)      { state.weather = "Cold";     state.weatherMult = 0.6; }
  else if (r < 0.45) { state.weather = "Mild";     state.weatherMult = 1.0; }
  else if (r < 0.75) { state.weather = "Hot";      state.weatherMult = 1.4; }
  else               { state.weather = "Heatwave"; state.weatherMult = 2.0; }
}

// --- log ---

function addLog(weather, cups, msg) {
  state.log.unshift({ shift: state.shifts, weather: weather, cups: cups, msg: msg || null });
  if (state.log.length > 10) state.log.pop();
}

// --- passive cups ---

setInterval(function() {
  if (state.passiveCups > 0 && isEligible) {
    state.totalCups += Math.round(state.passiveCups * 0.1);
    render();
  }
}, 100);

// --- cooldown ---

setInterval(function() {
  var el = document.getElementById("cooldown");
  var btn = document.getElementById("runBtn");
  if (!el || !btn) return;
  if (!isEligible) { el.textContent = ""; return; }

  var rem = state.lastRun + COOLDOWN - Date.now();
  if (rem <= 0) {
    el.textContent = "Ready";
    btn.disabled = txPending;
  } else {
    el.textContent = "Wait " + (rem / 1000).toFixed(1) + "s";
    btn.disabled = true;
  }
}, 100);

// --- render ---

function render() {
  var $ = function(id) { return document.getElementById(id); };

  $("lemons").textContent = state.lemons;
  $("cups").textContent = state.totalCups.toLocaleString();
  $("burned").textContent = state.vvBurned.toFixed(2);
  $("weather").textContent = "Weather: " + state.weather + "  \u00b7  Demand: " + state.weatherMult.toFixed(1) + "x";

  $("buyBtn").disabled = !isEligible || txPending;

  // upgrades
  var uEl = $("upgrades");
  var avail = UPGRADES.filter(function(u) { return !owned.has(u.id); });

  if (!isEligible) {
    uEl.innerHTML = '<div style="color:var(--muted)">Connect wallet to play.</div>';
  } else if (avail.length === 0) {
    uEl.innerHTML = '<div style="color:var(--muted)">All upgrades purchased.</div>';
  } else {
    uEl.innerHTML = avail.map(function(u) {
      return '<div class="up">' +
        '<div>' +
          '<div class="name">' + u.name + '</div>' +
          '<div class="desc">' + u.desc + '</div>' +
        '</div>' +
        '<button onclick="buyUpgrade(\'' + u.id + '\')">' + u.vv.toFixed(2) + ' $VV</button>' +
      '</div>';
    }).join("");
  }

  // log
  var lEl = $("log");
  if (state.log.length === 0) {
    lEl.innerHTML = '<div class="log-entry">Waiting for first shift...</div>';
  } else {
    lEl.innerHTML = state.log.map(function(e) {
      var num = "#" + String(e.shift).padStart(3, "0");
      if (e.msg) {
        return '<div class="log-entry"><span class="lo">' + num + " " + e.weather + " \u2014 " + e.msg + '</span></div>';
      }
      var cls = e.cups > 20 ? "hi" : "";
      return '<div class="log-entry"><span class="' + cls + '">' + num + " " + e.weather + " \u2014 " + e.cups + ' cups</span></div>';
    }).join("");
  }
}

// --- wallet ---

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
  render();
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
  render();
}

// --- expose ---

window.connectWallet = connectWallet;
window.buyLemons = buyLemons;
window.runStand = runStand;
window.buyUpgrade = buyUpgrade;

// --- init ---

window.addEventListener("load", async function() {
  if (window.ethereum) {
    try {
      var accs = await window.ethereum.request({ method: "eth_accounts" });
      if (accs && accs.length) await connectWallet();
    } catch (e) {}
  }
  render();
});
