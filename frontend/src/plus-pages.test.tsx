import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import "./panel";
import type { ClacamieuPanel } from "./panel";
import type { HassLike } from "./types";

vi.mock("./index.css?inline", () => ({ default: "" }));
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const panels: ClacamieuPanel[] = [];
afterEach(async () => {
  await act(async () => {
    panels.splice(0).forEach((panel) => panel.remove());
  });
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function mount(path: string, admin = false, vacuum = true) {
  const hass: HassLike = {
    states: {
      "vacuum.example": {
        entity_id: "vacuum.example",
        state: "docked",
        attributes: {
          supported_features: 8192,
          rooms: [{ id: 1, name: "Study" }],
        },
        last_changed: "",
        last_updated: "",
        context: { id: "t", parent_id: null, user_id: null },
      },
    },
    entities: {},
    devices: {},
    areas: {},
    panels: {},
    language: "en",
    user: { id: "u", name: "Example", is_admin: admin },
    callService: vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("blocked"), {
          name: "DevelopmentWriteBlocked",
        }),
      ),
    callWS: vi.fn().mockImplementation(async ({ type }) => {
      if (type === "get_services")
        return { dreame_vacuum: { vacuum_clean_segment: {} } };
      if (type === "repairs/list_issues")
        return { issues: [{ ignored: false }, { ignored: true }] };
      if (type === "clacamieu/dashboard/config")
        return { home_cards: null, rooms: null };
      return { value: {} };
    }),
  };
  if (!vacuum) hass.states = {};
  const panel = document.createElement("clacamieu-panel") as ClacamieuPanel;
  panel.hass = hass;
  panel.route = { path };
  panels.push(panel);
  await act(async () => {
    document.body.append(panel);
  });
  return { panel, hass, shadow: panel.shadowRoot! };
}
it("offers both Maison routes and hides AspiTout when no vacuum exists", async () => {
  const { shadow } = await mount("/plus");
  expect(
    shadow.querySelector('a[href="/clacamieu/plus/aspitout"]')?.textContent,
  ).toContain("Status, rooms and maintenance");
  expect(
    shadow.querySelector('a[href="/clacamieu/plus/systeme"]'),
  ).not.toBeNull();
  const absent = await mount("/plus", false, false);
  expect(
    absent.shadow.querySelector('a[href="/clacamieu/plus/aspitout"]'),
  ).toBeNull();
});
it("sends room cleaning through the shared action path and shows its inline error", async () => {
  const { shadow, hass } = await mount("/plus/aspitout");
  expect(
    shadow.querySelector('.bottom-nav [aria-current="page"]')?.textContent,
  ).toBe("More");
  await act(async () => {
    (
      shadow.querySelector('[aria-label="Clean Study"]') as HTMLButtonElement
    ).click();
  });
  expect(hass.callService).toHaveBeenCalledExactlyOnceWith(
    "dreame_vacuum",
    "vacuum_clean_segment",
    { segments: [1] },
    { entity_id: "vacuum.example" },
  );
  expect(shadow.querySelector('[role="alert"]')?.textContent).toBe(
    "This action is blocked in development.",
  );
});
it("shows repairs to non-admins but reserves configuration links for admins", async () => {
  const { shadow, hass } = await mount("/plus/systeme");
  expect(hass.callWS).toHaveBeenCalledWith({ type: "repairs/list_issues" });
  expect(shadow.textContent).toContain("Repairs1");
  expect(shadow.querySelector('a[href="/config/updates"]')).toBeNull();
  expect(shadow.querySelector('a[href="/config/repairs"]')).toBeNull();
  const admin = await mount("/plus/systeme", true);
  expect(
    admin.shadow.querySelector('a[href="/config/updates"]'),
  ).not.toBeNull();
  expect(
    admin.shadow.querySelector('a[href="/config/repairs"]'),
  ).not.toBeNull();
});
it("dispatches more-info from system entity rows", async () => {
  const { panel, hass, shadow } = await mount("/plus/systeme");
  const opened = vi.fn();
  panel.addEventListener("hass-more-info", opened);
  await act(async () => {
    panel.hass = {
      ...hass,
      states: {
        "vacuum.example": {
          ...hass.states["vacuum.example"],
          state: "unavailable",
        },
      },
    };
  });
  await act(async () => {
    (shadow.querySelector("section button") as HTMLButtonElement).click();
  });
  expect(opened).toHaveBeenCalledOnce();
  const event = opened.mock.calls[0][0] as CustomEvent;
  expect(event.detail).toEqual({ entityId: "vacuum.example" });
  expect(event.composed).toBe(true);
});
it("refreshes the visible map every ten seconds and cleans up on leaving", async () => {
  vi.useFakeTimers();
  let visibility: (entries: { isIntersecting: boolean }[]) => void = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: typeof visibility) {
        visibility = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  const { panel, hass, shadow } = await mount("/plus/aspitout");
  const camera = {
    ...hass.states["vacuum.example"],
    entity_id: "camera.map",
    attributes: { entity_picture: "/map" },
  };
  await act(async () => {
    panel.hass = {
      ...hass,
      states: { ...hass.states, "camera.map": camera },
      entities: {
        "vacuum.example": { entity_id: "vacuum.example", device_id: "robot" },
        "camera.map": { entity_id: "camera.map", device_id: "robot" },
      },
    };
  });
  await act(async () => {
    visibility([{ isIntersecting: true }]);
  });
  const before = shadow.querySelector("img")!.getAttribute("src");
  await act(async () => {
    vi.advanceTimersByTime(10_000);
  });
  expect(shadow.querySelector("img")!.getAttribute("src")).not.toBe(before);
  const after = shadow.querySelector("img")!.getAttribute("src");
  await act(async () => {
    visibility([{ isIntersecting: false }]);
    vi.advanceTimersByTime(10_000);
  });
  expect(shadow.querySelector("img")!.getAttribute("src")).toBe(after);
  const info = vi.fn();
  panel.addEventListener("hass-more-info", info);
  await act(async () => {
    (shadow.querySelector('[aria-label="Map"]') as HTMLButtonElement).click();
  });
  expect(info.mock.calls[0][0].detail).toEqual({ entityId: "camera.map" });
  await act(async () => {
    panel.route = { path: "/plus" };
  });
  expect(disconnect).toHaveBeenCalledOnce();
});
