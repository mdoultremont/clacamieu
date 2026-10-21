import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const directory = fileURLToPath(
  new URL("../../custom_components/clacamieu/frontend/dist/", import.meta.url),
);
const envPath =
  process.env.CLACAMIEU_HA_ENV ??
  fileURLToPath(new URL("../../../homeassistant/.env", import.meta.url));
const env = parseEnv(readFileSync(envPath, "utf8"));
assert(
  env.HA_TOKEN && env.HA_URL,
  "The local environment must contain both credentials.",
);
const files = readdirSync(directory, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => `${entry.parentPath}/${entry.name}`);
const found = files.some((path) => {
  const data = readFileSync(path);
  return (
    data.includes(Buffer.from(env.HA_TOKEN)) ||
    data.includes(Buffer.from(env.HA_URL))
  );
});
console.log(found ? "found" : "absent");
process.exitCode = found ? 1 : 0;
if (!found) {
  assert.deepEqual(
    files
      .filter((path) => path.endsWith(".js"))
      .map((path) => path.split("/").at(-1)),
    ["main.js"],
  );
  const main = readFileSync(`${directory}/main.js`, "utf8");
  assert(!main.includes("Blocked service call in development"));
  const fonts = [...main.matchAll(/url\(([^)]+)\)/g)]
    .map((match) => match[1].replaceAll(/["']/g, ""))
    .filter((url) => /\.woff2?$/.test(url));
  assert(fonts.length > 0);
  assert(fonts.every((url) => url.startsWith("/clacamieu_static/assets/")));
}
