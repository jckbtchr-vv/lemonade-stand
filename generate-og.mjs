// Generates og.png from on-chain PixelPlaced events
// Usage: node generate-og.mjs

import { createCanvas } from "@napi-rs/canvas";
import { readFileSync, writeFileSync } from "fs";

const TOKEN_ADDRESS = "0xd2969cc475a49e73182ae1c517add57db0f1c2ac";

const RPC = "https://mainnet.base.org";
const CANVAS_ADDRESS = "0x0000000000000000000000000000000000000000"; // TODO: update after deploy
const GRID_SIZE = 1000;

// PixelPlaced(address indexed user, uint16 x, uint16 y, uint24 color)
const TOPIC = "0xb4e9abde3834d83b42334cfc3abafd967ac745343b318d7e2e9fc789fa85a466";

async function fetchLogs() {
  const body = {
    jsonrpc: "2.0",
    method: "eth_getLogs",
    params: [{ fromBlock: "0x0", toBlock: "latest", address: CANVAS_ADDRESS, topics: [TOPIC] }],
    id: 1,
  };

  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return data.result || [];
}

function decodeLogs(logs) {
  return logs.map((log) => {
    const d = log.data.replace("0x", "");
    const x = parseInt(d.slice(0, 64), 16);
    const y = parseInt(d.slice(64, 128), 16);
    const color = parseInt(d.slice(128, 192), 16);
    return { x, y, color };
  });
}

async function main() {
  console.log("Fetching PixelPlaced events...");
  const logs = await fetchLogs();
  const pixels = decodeLogs(logs);
  console.log(`${pixels.length} pixels found`);

  const canvas = createCanvas(GRID_SIZE, GRID_SIZE);
  const ctx = canvas.getContext("2d");

  // Black background
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, GRID_SIZE, GRID_SIZE);

  const imageData = ctx.getImageData(0, 0, GRID_SIZE, GRID_SIZE);
  const buf = imageData.data;

  for (const { x, y, color } of pixels) {
    if (x >= GRID_SIZE || y >= GRID_SIZE) continue;
    const idx = (y * GRID_SIZE + x) * 4;
    buf[idx] = (color >> 16) & 0xff;
    buf[idx + 1] = (color >> 8) & 0xff;
    buf[idx + 2] = color & 0xff;
    buf[idx + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);

  const png = canvas.toBuffer("image/png");
  writeFileSync("og.png", png);
  console.log("og.png written (" + png.length + " bytes)");

  // Update OG title in index.html with live FDV
  await updateOgTitle();
}

async function updateOgTitle() {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${TOKEN_ADDRESS}`);
    const data = await res.json();
    const pair = data.pairs && data.pairs[0];
    if (!pair) return;

    const fdv = pair.fdv || pair.marketCap || 0;
    if (fdv <= 0) return;

    const title = `THE $${Math.round(fdv).toLocaleString("en-US")} HOMEPAGE`;

    let html = readFileSync("index.html", "utf-8");
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
    html = html.replace(/og:title" content="[^"]*"/, `og:title" content="${title}"`);
    html = html.replace(/twitter:title" content="[^"]*"/, `twitter:title" content="${title}"`);
    writeFileSync("index.html", html);
    console.log("OG title updated: " + title);
  } catch (e) {
    console.error("Title update failed", e);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
