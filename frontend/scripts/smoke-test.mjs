// Opens the interface in the installed Chrome, presses every control and
// saves screenshots to test-output/. Uses Chrome's fake microphone, so the
// real audio path runs without needing anyone to speak.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const OUTPUT = "test-output";
const STATES = ["Idle", "Listening", "Thinking", "Speaking", "Executing", "Error"];
const failures = [];

function check(name, passed, detail = "") {
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!passed) failures.push(name);
}

mkdirSync(OUTPUT, { recursive: true });
const server = await createServer({ server: { port: 1420, strictPort: true } });
await server.listen();

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: [
    "--use-angle=d3d11",
    "--ignore-gpu-blocklist",
    "--enable-unsafe-swiftshader",
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
});

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    // The backend is off in this first part, so refused connections are expected.
    if (message.type() === "error" && !message.location().url.includes(":8765")) problems.push(message.text());
  });

  await page.goto("http://127.0.0.1:1420/");
  await page.locator(".loading-screen").screenshot({ path: `${OUTPUT}/loading.png` });
  await page.locator(".loading-screen").waitFor({ state: "detached", timeout: 15000 });
  check("loading screen finishes", true);

  check("3D canvas is on the page", (await page.locator(".face-stage canvas").count()) === 1);
  check("clock shows the time", /\d\d:\d\d/.test(await page.locator(".clock-time").innerText()));
  await page.waitForTimeout(2200);
  const fps = await page.locator(".meter-footer .mono").innerText();
  check("animation is running", /\d+ FPS/.test(fps) && !fps.startsWith("0 "), fps);
  await page.screenshot({ path: `${OUTPUT}/idle.png` });

  const deck = page.locator(".control-deck");
  for (const name of STATES) {
    await deck.getByRole("button", { name, exact: true }).click();
    await page.waitForTimeout(1300);
    check(`preview ${name}`, (await page.locator(".state-name").innerText()).toLowerCase() === name.toLowerCase());
    await page.screenshot({ path: `${OUTPUT}/state-${name.toLowerCase()}.png` });
    if (name === "Speaking") {
      for (let shot = 1; shot <= 4; shot += 1) {
        await page.waitForTimeout(170);
        await page.screenshot({ path: `${OUTPUT}/speaking-${shot}.png`, clip: { x: 440, y: 90, width: 400, height: 520 } });
      }
    }
  }
  await deck.getByRole("button", { name: "Error", exact: true }).click();
  check("preview turns off", (await page.locator(".state-name").innerText()).toLowerCase() === "idle");

  await deck.getByRole("button", { name: "Turn microphone on" }).click();
  await page.getByRole("button", { name: "Turn microphone off" }).waitFor({ timeout: 5000 });
  await page.locator(".status-row", { hasText: "Microphone" }).locator(".tone-good").waitFor({ timeout: 5000 });
  check("microphone turns on and face listens", (await page.locator(".state-name").innerText()).toLowerCase() === "listening");
  await deck.getByRole("button", { name: "Turn microphone off" }).click();
  check("microphone turns off", (await page.locator(".state-name").innerText()).toLowerCase() === "idle");

  for (const name of ["Low", "High", "Medium"]) {
    await deck.getByRole("button", { name, exact: true }).click();
    await page.waitForTimeout(500);
    check(`quality ${name}`, (await deck.getByRole("button", { name, exact: true }).getAttribute("aria-pressed")) === "true");
  }
  await deck.getByRole("button", { name: "Low", exact: true }).click();
  await page.reload();
  await page.locator(".loading-screen").waitFor({ state: "detached", timeout: 15000 });
  check(
    "quality is remembered after restart",
    (await deck.getByRole("button", { name: "Low", exact: true }).getAttribute("aria-pressed")) === "true",
  );

  check("backend offline is explained", (await page.locator(".conversation").innerText()).includes("offline"));
  check("message box is locked while offline", await page.getByLabel("Message JARVIS").isDisabled());

  // A pretend backend tests the chat screen without needing a model.
  const stubStatus = { ollamaRunning: true, ollamaFound: true, version: "1", models: ["small:1b", "gemma3:4b"], activeModel: "gemma3:4b", modelInstalled: true };
  let cleared = false;
  let chosen = "";
  await page.route("**/ai/status", (route) => route.fulfill({ json: stubStatus }));
  await page.route("**/ai/model", (route) => {
    chosen = route.request().postDataJSON().name;
    stubStatus.activeModel = chosen;
    return route.fulfill({ json: { activeModel: chosen } });
  });
  await page.route("**/chat/history", (route) => {
    cleared = true;
    return route.fulfill({ json: { status: "cleared" } });
  });
  await page.route("**/chat/stream", (route) => {
    const body = route.request().postDataJSON();
    if (body.message === "fail") {
      return route.fulfill({ contentType: "application/x-ndjson", body: `${JSON.stringify({ type: "error", code: "ollama_error", message: "Model crashed" })}\n` });
    }
    const lines = [{ type: "token", text: "හරි " }, { type: "token", text: "sir." }, { type: "done", language: "sinhala", seconds: 2, tokensPerSecond: 2 }];
    return route.fulfill({ contentType: "application/x-ndjson", body: `${lines.map((line) => JSON.stringify(line)).join("\n")}\n` });
  });
  await page.reload();
  await page.locator(".clock-time").waitFor();
  await page.locator(".loading-screen").waitFor({ state: "detached", timeout: 15000 });

  const box = page.getByLabel("Message JARVIS");
  check("status shows the active model", (await page.locator(".panel", { hasText: "Status" }).innerText()).includes("gemma3:4b"));
  await box.fill("hello");
  await box.press("Enter");
  await page.locator(".message-assistant", { hasText: "හරි sir." }).waitFor({ timeout: 5000 });
  check("reply appears in the conversation", true);
  check("reply speed is shown", (await page.locator(".message-assistant small").innerText()).includes("2.0 tokens/s"));
  await page.screenshot({ path: `${OUTPUT}/chat.png` });

  await box.fill("fail");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByRole("alert").waitFor({ timeout: 5000 });
  check("AI failure shows an error", (await page.locator(".state-name").innerText()).toLowerCase() === "error");
  await page.getByRole("button", { name: "Dismiss" }).click();

  await page.getByLabel("Model").selectOption("small:1b");
  await page.waitForTimeout(300);
  check("model can be changed", chosen === "small:1b");

  await page.getByRole("button", { name: "Clear" }).click();
  await page.locator(".conversation-empty").waitFor({ timeout: 3000 });
  check("conversation can be cleared", cleared);

  await context.close();

  const blocked = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const blockedPage = await blocked.newPage();
  await blockedPage.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("blocked", "NotAllowedError"));
  });
  await blockedPage.goto("http://127.0.0.1:1420/");
  await blockedPage.locator(".loading-screen").waitFor({ state: "detached", timeout: 15000 });
  await blockedPage.getByRole("button", { name: "Turn microphone on" }).click();
  await blockedPage.getByRole("alert").waitFor({ timeout: 5000 });
  check("blocked microphone shows a clear error", (await blockedPage.locator(".state-name").innerText()).toLowerCase() === "error");
  await blockedPage.screenshot({ path: `${OUTPUT}/mic-denied.png` });
  await blockedPage.getByRole("button", { name: "Dismiss" }).click();
  check("error can be dismissed", (await blockedPage.locator(".state-name").innerText()).toLowerCase() === "idle");
  await blocked.close();

  // Only the first page is watched, because the blocked test logs an error on purpose.
  check("no errors in the console", problems.length === 0, problems.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  await server.close();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nAll checks passed");
