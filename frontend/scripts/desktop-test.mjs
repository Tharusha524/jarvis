// Starts the real Tauri app and drives its window through WebView2's debug
// port, so this tests the desktop build on the real graphics chip. A window
// appears on screen for about a minute. The microphone is Chrome's fake one.
//
// Dev build:      npm run smoke:desktop
// Release build:  npm run smoke:desktop -- --release
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const OUTPUT = "test-output";
const DEBUG_PORT = 9333;
const release = process.argv.includes("--release");
// Made by backend/tests/live_speech_check.py. Played as a pretend microphone.
const fakeVoice = resolve(OUTPUT, "fake-voice.wav");
const voiceFlag = existsSync(fakeVoice) ? ` "--use-file-for-fake-audio-capture=${fakeVoice}%noloop"` : "";
const failures = [];

function check(name, passed, detail = "") {
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!passed) failures.push(name);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Adds up the memory of the app and every process it started. */
function memoryMb(pid) {
  const script = `
    $all = Get-CimInstance Win32_Process
    $ids = New-Object System.Collections.ArrayList
    [void]$ids.Add(${pid})
    for ($i = 0; $i -lt $ids.Count; $i++) {
      $all | Where-Object { $_.ParentProcessId -eq $ids[$i] } | ForEach-Object { [void]$ids.Add($_.ProcessId) }
    }
    $sum = ($ids | ForEach-Object { (Get-Process -Id $_ -ErrorAction SilentlyContinue).PrivateMemorySize64 } | Measure-Object -Sum).Sum
    [math]::Round($sum / 1MB)`;
  return Number(execFileSync("powershell.exe", ["-NoProfile", "-Command", script]).toString().trim());
}

async function connect() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
    } catch {
      await wait(1000);
    }
  }
  throw new Error("Could not reach the JARVIS window");
}

async function readFps(page, seconds = 4) {
  await page.waitForTimeout(seconds * 1000);
  return Number.parseInt(await page.locator(".meter-footer .mono").innerText(), 10);
}

mkdirSync(OUTPUT, { recursive: true });
const server = release ? null : await createServer({ server: { port: 1420, strictPort: true } });
await server?.listen();

const app = spawn(`src-tauri/target/${release ? "release" : "debug"}/jarvis.exe`, [], {
  stdio: "ignore",
  env: {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${DEBUG_PORT} --use-fake-device-for-media-stream --use-fake-ui-for-media-stream${voiceFlag}`,
  },
});
let closed = false;
app.on("exit", () => {
  closed = true;
});

try {
  const browser = await connect();
  const page = browser.contexts()[0].pages()[0];
  const problems = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    // Refused connections are normal while the backend is still starting.
    if (message.type() === "error" && !message.location().url.includes(":8765")) problems.push(message.text());
  });

  // The page may still be blank here, so wait for it to appear before it leaves.
  await page.locator(".clock-time").waitFor({ timeout: 30000 });
  await page.locator(".loading-screen").waitFor({ state: "detached", timeout: 30000 });
  check("desktop window loads", true);

  // Records every click, so a surprise microphone change can be traced.
  // Also counts 3D draw calls, to prove drawing stops while minimized.
  await page.evaluate(() => {
    window.__draws = 0;
    window.__speech = [];
    const realFetch = window.fetch;
    window.fetch = async (...args) => {
      const url = String(args[0]);
      if (!url.includes("/speech/")) return realFetch(...args);
      const size = args[1]?.body?.size ?? 0;
      try {
        const response = await realFetch(...args);
        const copy = await response.clone().text();
        window.__speech.push(`${url.split("/").pop()} sent ${size} bytes, answer ${response.status}: ${copy.slice(0, 120)}`);
        return response;
      } catch (error) {
        window.__speech.push(`${url.split("/").pop()} failed: ${error.message}`);
        throw error;
      }
    };
    for (const name of ["drawElements", "drawArrays", "drawElementsInstanced"]) {
      const original = WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name] = function (...args) {
        window.__draws += 1;
        return original.apply(this, args);
      };
    }
    window.__clicks = [];
    document.addEventListener("click", (event) => {
      const target = event.target.closest("button");
      window.__clicks.push(`${Math.round(performance.now())}ms ${target?.getAttribute("aria-label") ?? target?.textContent ?? event.target.tagName} at ${event.clientX},${event.clientY}`);
    }, true);
  });

  const system = await page.locator(".panel", { hasText: "System" }).innerText();
  check("real CPU, memory and disk readings", /CPU/.test(system) && /GB/.test(system) && /free/.test(system), system.replace(/\s+/g, " "));

  const status = page.locator(".panel", { hasText: "Status" });
  // The backend takes a few seconds to start after the window opens.
  await status.getByText("Backend offline").waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
  const statusText = await status.innerText();
  check("AI status comes from the backend", !/Checking|Backend offline/.test(statusText), statusText.replace(/\s+/g, " "));
  check("internet status is checked", /Online|Offline/.test(statusText));

  const deck = page.locator(".control-deck");
  // Switching rebuilds the head, so the first seconds are not a fair reading.
  const targets = { High: 60, Medium: 30, Low: 20 };
  for (const [name, target] of Object.entries(targets)) {
    await deck.getByRole("button", { name, exact: true }).click();
    const stall = await readFps(page, 6);
    const readings = [];
    for (let i = 0; i < 5; i += 1) readings.push(await readFps(page, 1.5));
    const worst = Math.min(...readings);
    console.log(`INFO  ${name} quality: ${readings.join(", ")} FPS (just after switching: ${stall})`);
    const fastest = Math.max(...readings);
    check(`${name} quality keeps its frame rate`, worst >= target * 0.8 && fastest <= target * 1.2, `${worst} to ${fastest} of ${target} FPS`);
  }
  await deck.getByRole("button", { name: "Medium", exact: true }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUTPUT}/desktop-idle.png` });

  console.log(`INFO  memory: ${memoryMb(app.pid)} MB`);

  // Real AI chat runs only once a model is installed.
  const box = page.getByLabel("Message JARVIS");
  if (await box.isEnabled()) {
    await box.fill("Say hello in five words.");
    await box.press("Enter");
    await page.locator(".state-name", { hasText: /thinking/i }).waitFor({ timeout: 10000 });
    await page.locator(".message-assistant small").waitFor({ timeout: 180000 });
    const reply = await page.locator(".message-assistant").first().innerText();
    check("real AI reply in the window", reply.length > 5, reply.replace(/\s+/g, " "));
    await page.screenshot({ path: `${OUTPUT}/desktop-chat.png` });

    await box.fill("Write a very long story about the sea.");
    await box.press("Enter");
    await page.locator(".message-assistant").nth(1).filter({ hasText: /\w{3}/ }).waitFor({ timeout: 180000 });
    await page.getByRole("button", { name: "Stop" }).click();
    await page.getByRole("button", { name: "Send" }).waitFor({ timeout: 8000 });
    check("stop button ends a reply", true);

    await page.getByRole("button", { name: "Clear" }).click();
    await page.locator(".conversation-empty").waitFor({ timeout: 8000 });
    check("clear button empties the conversation", true);
  } else {
    console.log("INFO  skipped real chat: no model ready");
  }

  // This step failed now and then with no known cause, so record the page if it does.
  await deck.getByRole("button", { name: "Turn microphone on" }).click({ timeout: 8000 }).catch(async (error) => {
    const scene = await page.evaluate(() => ({
      label: document.querySelector(".mic-button")?.getAttribute("aria-label"),
      visibility: document.visibilityState,
      focus: document.hasFocus(),
      state: document.querySelector(".state-name")?.textContent,
      size: `${window.innerWidth}x${window.innerHeight}`,
      clicks: window.__clicks,
    }));
    console.error("Microphone button not reachable:", JSON.stringify(scene));
    await page.screenshot({ path: `${OUTPUT}/mic-button-failure.png` }).catch(() => {});
    throw error;
  });
  await page.getByRole("button", { name: "Turn microphone off" }).waitFor({ timeout: 5000 });
  // The label changes as soon as access is requested, before the state does.
  await page.locator(".state-name", { hasText: /listening/i }).waitFor({ timeout: 5000 }).catch(() => {});
  check("microphone path works in WebView2", (await page.locator(".state-name").innerText()).toLowerCase() === "listening");

  // Full voice loop: hear the recording, think, answer, speak, listen again.
  if (voiceFlag && (await box.isEnabled())) {
    const heard = page.locator(".message-user", { hasText: /capital of france/i });
    const wasHeard = await heard.waitFor({ timeout: 30000 }).then(() => true, () => false);
    check("spoken words appear as a message", wasHeard);
    if (!wasHeard) {
      const scene = await page.evaluate(() => ({
        speech: window.__speech,
        state: document.querySelector(".state-name")?.textContent,
        alert: document.querySelector(".alerts")?.textContent,
        mic: document.querySelector(".mic-button")?.getAttribute("aria-label"),
      }));
      console.error("Voice loop stopped:", JSON.stringify(scene));
    }
    if (wasHeard) {
      const spoke = await page.locator(".state-name", { hasText: /speaking/i }).waitFor({ timeout: 180000 }).then(() => true, () => false);
      check("JARVIS speaks the reply aloud", spoke);
      await page.screenshot({ path: `${OUTPUT}/desktop-speaking.png` });
      const back = await page.locator(".state-name", { hasText: /listening/i }).waitFor({ timeout: 90000 }).then(() => true, () => false);
      const reply = await page.locator(".message-assistant").last().innerText();
      check("the reply answers the question", /paris/i.test(reply), reply.replace(/\s+/g, " "));
      check("returns to listening afterwards", back);
    }
  }
  await deck.getByRole("button", { name: "Turn microphone off" }).click();

  const before = await page.evaluate(() => window.innerWidth);
  await page.getByRole("button", { name: "Maximize or restore" }).click();
  await page.waitForTimeout(1000);
  const maximized = await page.evaluate(() => window.innerWidth);
  check("maximize button works", maximized !== before, `${before}px to ${maximized}px`);
  await page.getByRole("button", { name: "Maximize or restore" }).click();
  await page.waitForTimeout(800);

  await page.getByRole("button", { name: "Minimize" }).click();
  await wait(1500);
  check("minimize button keeps the app running", !closed);
  const drawsBefore = await page.evaluate(() => window.__draws);
  await wait(2000);
  const drawsAfter = await page.evaluate(() => window.__draws);
  check("drawing stops while minimized", drawsBefore > 0 && drawsAfter === drawsBefore, `${drawsAfter - drawsBefore} draws in 2 seconds`);

  check("no errors in the desktop console", problems.length === 0, problems.slice(0, 3).join(" | "));

  await page.getByRole("button", { name: "Close" }).click().catch(() => {});
  await wait(3000);
  check("close button quits the app", closed);
} finally {
  if (!closed) app.kill();
  await server?.close();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nAll desktop checks passed");
process.exit(0);
