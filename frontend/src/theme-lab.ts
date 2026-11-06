import type { HassLike } from "./types";

const modes = ["auto", "light", "dark"] as const;
type Mode = (typeof modes)[number];

function stored<T extends string>(key: string, values: readonly T[]): T {
  const param = new URLSearchParams(location.search).get(key.split("-").pop()!);
  if (param && (values as readonly string[]).includes(param)) return param as T;
  try {
    const value = localStorage.getItem(key);
    if (value && (values as readonly string[]).includes(value))
      return value as T;
  } catch {
    // Storage is optional for the lab.
  }
  return values[0];
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage is optional for the lab.
  }
}

export function installThemeLab(
  element: HTMLElement & { hass: HassLike | null },
): (hass: HassLike) => HassLike {
  let mode: Mode = stored("clacamieu-lab-mode", modes);
  let latest: HassLike | null = null;
  const withMode = (hass: HassLike): HassLike =>
    mode === "auto"
      ? hass
      : { ...hass, themes: { ...hass.themes, darkMode: mode === "dark" } };

  const bar = document.createElement("div");
  bar.style.cssText =
    "position:fixed;bottom:84px;right:8px;z-index:10;display:flex;gap:4px;padding:4px;border-radius:999px;background:rgba(20,20,24,.82);backdrop-filter:blur(8px);font:500 11px system-ui;color:#fff;box-shadow:0 4px 16px rgba(0,0,0,.25)";
  const render = () => {
    bar.replaceChildren(
      button(
        mode === "auto" ? "◐ auto" : mode === "dark" ? "● sombre" : "○ clair",
        () => {
          mode = modes[(modes.indexOf(mode) + 1) % modes.length];
          store("clacamieu-lab-mode", mode);
          render();
          if (latest) element.hass = withMode(latest);
        },
      ),
    );
  };
  render();
  document.body.append(bar);
  return (hass) => {
    latest = hass;
    return withMode(hass);
  };
}

function button(label: string, onClick: () => void) {
  const node = document.createElement("button");
  node.textContent = label;
  node.style.cssText = `border:0;border-radius:999px;padding:5px 9px;cursor:pointer;font:inherit;color:inherit;background:transparent`;
  node.addEventListener("click", onClick);
  return node;
}
