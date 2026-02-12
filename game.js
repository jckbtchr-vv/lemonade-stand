// lemonade.exe — simplified
// $VV on Base: 0xd2969cc475a49e73182ae1c517add57db0f1c2ac

const BASE_CHAIN_ID = 8453n;
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
  cash: 5.00,
  lemons: 0,
  totalCups: 0,
  vvBurned: 0,
  price: 0.50,
  demand: 1.0,
  output: 1.0,
  weather: "--",
  weatherMult: 1.0,
  lastRun: 0,
  shifts: 0,
  passive: 0,
  log: []
};

// --- upgrades ---

const UPGRADES = [
  { id: "cups",    name: "better cups",  desc: "+$0.15/cup",      cost: 20,    vv: 0.50,  apply: () => { state.price += 0.15; } },
  { id: "cooler",  name: "ice cooler",   desc: "+50% demand",     cost: 75,    vv: 1.00,  apply: () => { state.demand *= 1.5; } },
  { id: "stand2",  name: "second stand", desc: "2x output",       cost: 250,   vv: 2.00,  apply: () => { state.output *= 2; } },
  { id: "sign",    name: "neon sign",    desc: "+50% demand",     cost: 800,   vv: 3.00,  apply: () => { state.demand *= 1.5; } },
  { id: "truck",   name: "food truck",   desc: "2x output",       cost: 3000,  vv: 5.00,  apply: () => { state.output *= 2; } },
  { id: "bill",    name: "billboard",    desc: "2x demand",       cost: 10000, vv: 8.00,  apply: () => { state.demand *= 2; } },
  { id: "franch",  name: "franchise",    desc: "passive $5/sec",  cost: 25000, vv: 15.00, apply: () => { state.passive += 5; } }
];

const owned = new Set();

// --- token burn ---

function showTx(msg) {
  const el = document.getElementById("txOverlay");
  const m = document.getElementById("txMsg");
  if (el) el.style.display = "flex";
  if (m) m.textContent = msg || "awaiting transaction...";
  txPending = true;
}

function hideTx() {
  const el = document.getElementById("txOverlay");
  if (el) el.style.display = "none";
  txPending = false;
}

async function burn(amount, action) {
  if (!signer || !tokenContract || !isEligible) return false;
  if (amount <= 0) return true;
  if (lastBalance < amount) return false;

  try {
    showTx("burning " + amount.toFixed(2) + " $VV...");
    const w = tokenContract.connect(signer);
    const wei = ethers.parseUnits(amount.toFixed(4), tokenDecimals);
    const tx = await w.transfer(BURN_ADDRESS, wei);
    showTx("confirming...");
    await tx.wait();
    state.vvBurned += amount;
    refreshBalance();
    hideTx();
    return true;
  } catch (err) {
    hideTx();
    if (err.code === "ACTION_REJECTED" || err.code === 4001) return false;
    console.error("burn failed (" + action + "):", err);
    return false;
  }
}

// --- game actions ---

async function buyLemons() {
  if (state.cash < 2 || txPending) return;
  const ok = await burn(0.10, "buyLemons");
  if (!ok) return;
  state.cash -= 2;
  state.lemons += 10;
  render();
}

async function runStand() {
  if (!isEligible || txPending) return;
  if (Date.now() < state.lastRun + COOLDOWN) return;

  const ok = await burn(0.10, "runStand");
  if (!ok) return;

  state.lastRun = Date.now();
  state.shifts++;
  rollWeather();

  const used = Math.min(state.lemons, 10);
  state.lemons -= used;

  if (used === 0) {
    addLog(state.weather, 0, 0, "no lemons!");
    render();
    return;
  }

  const cups = Math.max(1, Math.round(used * 2 * state.demand * state.output * state.weatherMult));
  const rev = cups * state.price;
  state.totalCups += cups;
  state.cash += rev;

  addLog(state.weather, cups, rev);
  render();
}

async function buyUpgrade(id) {
  const u = UPGRADES.find(function(x) { return x.id === id; });
  if (!u || owned.has(id) || state.cash < u.cost || txPending) return;

  const ok = await burn(u.vv, "upgrade:" + id);
  if (!ok) return;

  state.cash -= u.cost;
  owned.add(id);
  u.apply();
  render();
}

// --- weather ---

function rollWeather() {
  const r = Math.random();
  if (r < 0.15)      { state.weather = "cold";     state.weatherMult = 0.6; }
  else if (r < 0.45) { state.weather = "mild";     state.weatherMult = 1.0; }
  else if (r < 0.75) { state.weather = "hot";      state.weatherMult = 1.4; }
  else               { state.weather = "heatwave"; state.weatherMult = 2.0; }
}

// --- log ---

function addLog(weather, cups, rev, msg) {
  state.log.unshift({
    shift: state.shifts,
    weather: weather,
    cups: cups,
    rev: rev,
    msg: msg || null
  });
  if (state.log.length > 10) state.log.pop();
}

// --- passive income ---

setInterval(function() {
  if (state.passive > 0 && isEligible) {
    state.cash += state.passive * 0.1;
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
    el.textContent = "ready";
    btn.disabled = txPending;
  } else {
    el.textContent = "wait " + (rem / 1000).toFixed(1) + "s";
    btn.disabled = true;
  }
}, 100);

// --- render ---

function render() {
  var $ = function(id) { return document.getElementById(id); };

  $("cash").textContent = "$" + state.cash.toFixed(2);
  $("lemons").textContent = state.lemons;
  $("cups").textContent = state.totalCups.toLocaleString();
  $("burned").textContent = state.vvBurned.toFixed(2);
  $("weather").textContent = "weather: " + state.weather + " | demand: " + state.weatherMult.toFixed(1) + "x";

  $("buyBtn").disabled = !isEligible || txPending;

  // upgrades
  var uEl = $("upgrades");
  var avail = UPGRADES.filter(function(u) { return !owned.has(u.id); });

  if (!isEligible) {
    uEl.innerHTML = '<div style="color:#444">connect wallet to play.</div>';
  } else if (avail.length === 0) {
    uEl.innerHTML = '<div style="color:#444">all upgrades purchased.</div>';
  } else {
    uEl.innerHTML = avail.map(function(u) {
      var can = state.cash >= u.cost;
      return '<div class="up">' +
        '<div class="info">' +
          '<div class="name">' + u.name + ' &mdash; $' + u.cost.toLocaleString() + '</div>' +
          '<div class="desc">' + u.desc + ' <span class="vv" style="display:inline">' + u.vv.toFixed(2) + ' $VV</span></div>' +
        '</div>' +
        '<button ' + (can ? '' : 'disabled') + ' onclick="buyUpgrade(\'' + u.id + '\')">' + (can ? 'buy' : '---') + '</button>' +
      '</div>';
    }).join("");
  }

  // log
  var lEl = $("log");
  if (state.log.length === 0) {
    lEl.innerHTML = '<div class="log-entry">waiting for first shift...</div>';
  } else {
    lEl.innerHTML = state.log.map(function(e) {
      var num = "#" + String(e.shift).padStart(3, "0");
      if (e.msg) {
        return '<div class="log-entry"><span class="lo">' + num + ' ' + e.weather + ' — ' + e.msg + '</span></div>';
      }
      var cls = e.cups > 15 ? "hi" : "";
      return '<div class="log-entry"><span class="' + cls + '">' + num + ' ' + e.weather + ' — ' + e.cups + ' cups, $' + e.rev.toFixed(2) + '</span></div>';
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
      var dec = await tokenContract.decimals();
      tokenDecimals = Number(dec);
    } catch (e) { tokenDecimals = 18; }

    document.getElementById("addr").textContent = userAddress.slice(0, 6) + "..." + userAddress.slice(-4);
    document.getElementById("connectBtn").textContent = "disconnect";

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
  document.getElementById("connectBtn").textContent = "connect";
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

async function checkNetwork() {
  if (!provider) return;
  try {
    var net = await provider.getNetwork();
    var ok = net.chainId === BASE_CHAIN_ID;
    document.getElementById("netWarn").style.display = ok ? "none" : "inline";
    setEligible(lastBalance, ok);
  } catch (e) {
    document.getElementById("netWarn").style.display = "inline";
    setEligible(0, false);
  }
}

async function refreshBalance() {
  if (!provider || !userAddress) return;
  try {
    var c = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, provider);
    var bal = await c.balanceOf(userAddress);
    var n = Number(ethers.formatUnits(bal, tokenDecimals));
    lastBalance = n;
    document.getElementById("bal").textContent = n.toFixed(2) + " $VV";
    var net = await provider.getNetwork();
    setEligible(n, net.chainId === BASE_CHAIN_ID);
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
