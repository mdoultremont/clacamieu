import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";

const directory = "/tmp/clacamieu-shots";
await mkdir(directory, { recursive: true });
const chrome = spawn(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  [
    "--headless=new",
    "--hide-scrollbars",
    "--window-size=390,844",
    "--force-device-scale-factor=2",
    "--remote-debugging-port=0",
    "--remote-allow-origins=*",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${new URL("../node_modules/.cache/maison-browser", import.meta.url).pathname}`,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Headless browser did not start.")),
      15_000,
    );
    chrome.stderr.on("data", (chunk) => {
      const match = chunk
        .toString()
        .match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    chrome.once("error", reject);
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let sequence = 0;
  const pending = new Map();
  const events = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result);
    } else events.push(message);
  };
  const call = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      socket.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        }),
      );
    });
  const { targetId } = await call("Target.createTarget", {
    url: "about:blank",
  });
  const { sessionId } = await call("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const page = (method, params = {}) => call(method, params, sessionId);
  await page("Runtime.enable");
  await page("Page.enable");
  await page("Network.enable");
  const evaluate = async (expression) => {
    const result = await page("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    assert(!result.exceptionDetails, "Browser evaluation failed.");
    return result.result.value;
  };
  const waitFor = (predicate) =>
    evaluate(
      `new Promise((resolve,reject)=>{const start=Date.now();const check=()=>{if(${predicate})return resolve(true);if(Date.now()-start>20000)return reject(new Error('Page not ready'));setTimeout(check,100)};check()})`,
    );
  const capture = async (name, width, height, path) => {
    await page("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await page("Page.navigate", { url: `http://localhost:5174/${path}` });
    await waitFor(
      "document.querySelector('clacamieu-panel')?.hass && document.querySelector('clacamieu-panel')?.shadowRoot?.querySelector('h1')",
    );
    await evaluate("document.fonts.ready");
    const state = await evaluate(`(() => {
      const p=document.querySelector('clacamieu-panel');const s=p.shadowRoot;
      return {width:innerWidth,scrollWidth:s.querySelector('.panel-shell').scrollWidth,fonts:[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family),rooms:s.querySelectorAll('.room').length,columns:s.querySelector('.room-grid')&&getComputedStyle(s.querySelector('.room-grid')).gridTemplateColumns,bodyFont:getComputedStyle(p).fontFamily,headingFont:getComputedStyle(s.querySelector('h1')).fontFamily};
    })()`);
    assert.equal(state.width, width);
    assert(state.scrollWidth <= width, "Panel overflows horizontally.");
    assert(
      state.fonts.includes("Geist") && state.fonts.includes("Space Grotesk"),
      "Bundled fonts did not load.",
    );
    const { data } = await page("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(`${directory}/${name}.png`, Buffer.from(data, "base64"));
    console.log(JSON.stringify({ capture: name, ...state }));
  };
  await capture("frontend-dev-mobile", 390, 844, "");
  const before = events.length;
  await evaluate(
    "document.querySelector('clacamieu-panel').shadowRoot.querySelector('[data-slot=button]').click()",
  );
  await waitFor(
    "document.querySelector('clacamieu-panel').shadowRoot.querySelector('[role=alert]')",
  );
  const serviceEvents = events.slice(before);
  const blockedService = serviceEvents.some(
    (event) =>
      event.method === "Runtime.consoleAPICalled" &&
      event.params.args.some(
        (arg) =>
          typeof arg.value === "string" &&
          arg.value.startsWith("Blocked service call in development: "),
      ),
  );
  const serviceSent = serviceEvents.some(
    (event) =>
      event.method === "Network.webSocketFrameSent" &&
      (() => {
        try {
          return (
            JSON.parse(event.params.response.payloadData).type ===
            "call_service"
          );
        } catch {
          return false;
        }
      })(),
  );
  assert(blockedService && !serviceSent, "Development service guard failed.");
  console.log(
    "Service click blocked in browser console; zero call_service frames sent.",
  );
  await capture("frontend-dev-desktop", 1280, 900, "");
  await capture("frontend-dev-plus", 390, 844, "?tab=plus");
  await waitFor(
    "document.querySelector('clacamieu-panel').shadowRoot.querySelector('[role=switch]:not(:disabled)')",
  );
  const writeStart = events.length;
  await evaluate(
    "document.querySelector('clacamieu-panel').shadowRoot.querySelector('[role=switch]').click()",
  );
  await waitFor(
    "document.querySelector('clacamieu-panel').shadowRoot.querySelector('[role=alert]')",
  );
  const writeEvents = events.slice(writeStart);
  assert(
    writeEvents.some(
      (event) =>
        event.method === "Runtime.consoleAPICalled" &&
        event.params.args.some(
          (arg) =>
            arg.value ===
            "Blocked WebSocket call in development: frontend/set_user_data",
        ),
    ),
  );
  assert(
    !writeEvents.some(
      (event) =>
        event.method === "Network.webSocketFrameSent" &&
        (() => {
          try {
            return (
              JSON.parse(event.params.response.payloadData).type ===
              "frontend/set_user_data"
            );
          } catch {
            return false;
          }
        })(),
    ),
  );
  console.log(
    "Preference write blocked; rejection shown inline; zero write frames sent.",
  );
} finally {
  socket?.close();
  chrome.kill();
}
