// Draws the app icon in Chrome and saves it as a 1024px PNG. Afterwards run:
//   npx tauri icon ../resources/icon.png
import { copyFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <radialGradient id="bg"><stop offset="0" stop-color="#0b3b55"/><stop offset="1" stop-color="#03101a"/></radialGradient>
    <radialGradient id="core"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#7fe6ff"/><stop offset="1" stop-color="#1fb6ff" stop-opacity="0"/></radialGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="14"/></filter>
  </defs>
  <circle cx="512" cy="512" r="500" fill="url(#bg)"/>
  <g fill="none" stroke="#3fd0ff">
    <circle cx="512" cy="512" r="440" stroke-width="10" stroke-opacity=".55"/>
    <circle cx="512" cy="512" r="370" stroke-width="44" stroke-dasharray="150 82"/>
    <circle cx="512" cy="512" r="370" stroke-width="44" stroke-dasharray="150 82" filter="url(#glow)"/>
    <circle cx="512" cy="512" r="280" stroke-width="12" stroke="#a8f0ff"/>
  </g>
  <circle cx="512" cy="512" r="230" fill="url(#core)"/>
</svg>`;

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  await page.setContent(`<body style="margin:0;background:transparent">${SVG}</body>`);
  mkdirSync("../resources", { recursive: true });
  mkdirSync("public", { recursive: true });
  await page.screenshot({ path: "../resources/icon.png", omitBackground: true });
  copyFileSync("../resources/icon.png", "public/icon.png");
} finally {
  await browser.close();
}
console.log("Saved resources/icon.png");
