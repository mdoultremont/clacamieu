import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "./panel";
import type { ClacamieuPanel } from "./panel";
import type { HassLike } from "./types";

vi.mock("./index.css?inline", () => ({ default: ":host {color: white}" }));
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function fixture(): HassLike {
  return {
    states: {},
    entities: {},
    devices: {},
    panels: {},
    areas: { room_a: { area_id: "room_a", name: "Room A", icon: null } },
    user: { id: "user_a", name: "Alex Example", is_admin: true },
    language: "en",
    callService: vi.fn().mockResolvedValue(null),
    callWS: vi.fn().mockImplementation((message) => {
      if (message.type === "clacamieu/dashboard/config")
        return Promise.reject(new Error("not deployed"));
      return Promise.resolve({ value: {} });
    }),
  };
}
const panels: ClacamieuPanel[] = [];
afterEach(async () => {
  await act(async () => {
    panels.splice(0).forEach((panel) => panel.remove());
  });
});
async function mount(hass: HassLike) {
  const panel = document.createElement("clacamieu-panel") as ClacamieuPanel;
  panel.hass = hass;
  panel.narrow = true;
  panel.route = { path: "" };
  panel.panel = { url_path: "clacamieu", title: "Maison", config: {} };
  panels.push(panel);
  await act(async () => {
    document.body.append(panel);
  });
  return panel;
}

describe("panel lifecycle and screens", () => {
  it("accepts properties before connection and falls back to all rooms when config fails", async () => {
    const panel = await mount(fixture());
    expect(panel.shadowRoot?.querySelector("h1")?.textContent).toContain(
      "Alex",
    );
    expect(panel.shadowRoot?.querySelectorAll(".room")).toHaveLength(1);
    expect(
      panel.shadowRoot?.querySelectorAll(".nav-inner button:disabled"),
    ).toHaveLength(3);
  });
  it("uses new hass snapshots and preserves the root and tab across reconnects", async () => {
    const hass = fixture();
    const panel = await mount(hass);
    const root = panel.shadowRoot?.querySelector("#root");
    await act(async () => {
      panel.hass = { ...hass, user: { ...hass.user, name: "Blair Example" } };
    });
    expect(panel.shadowRoot?.querySelector("h1")?.textContent).toContain(
      "Blair",
    );
    await act(async () => {
      (
        panel.shadowRoot?.querySelectorAll(
          ".nav-inner button",
        )[4] as HTMLButtonElement
      ).click();
    });
    expect(panel.shadowRoot?.querySelector("h1")?.textContent).toBe("More");
    await act(async () => {
      panel.remove();
      document.body.append(panel);
    });
    expect(panel.shadowRoot?.querySelector("#root")).toBe(root);
    expect(panel.shadowRoot?.querySelector("h1")?.textContent).toBe("More");
  });
  it("dispatches the composed HA menu event and hides admin settings for non-admins", async () => {
    const hass = fixture();
    hass.user.is_admin = false;
    hass.panels.lovelace = {
      url_path: "lovelace",
      title: null,
      icon: null,
      component_name: "lovelace",
    };
    hass.panels.other = {
      url_path: "other",
      title: "Other",
      icon: null,
      component_name: "custom",
    };
    const panel = await mount(hass);
    await act(async () => {
      (
        panel.shadowRoot?.querySelectorAll(
          ".nav-inner button",
        )[4] as HTMLButtonElement
      ).click();
    });
    expect(panel.shadowRoot?.querySelector('a[href="/config"]')).toBeNull();
    expect(
      panel.shadowRoot?.querySelector('a[href="/lovelace"]')?.textContent,
    ).toBe("Overview");
    expect(panel.shadowRoot?.querySelector('a[href="/other"]')).toBeNull();
    const listener = vi.fn();
    panel.addEventListener("hass-toggle-menu", listener);
    await act(async () => {
      (
        panel.shadowRoot?.querySelector("button.link-row") as HTMLButtonElement
      ).click();
    });
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0]).toMatchObject({
      bubbles: true,
      composed: true,
    });
  });
  it("shows a blocked preference error inline and keeps the switch unchanged", async () => {
    const hass = fixture();
    hass.callWS = vi.fn().mockImplementation((message) => {
      if (message.type === "frontend/set_user_data")
        return Promise.reject(
          Object.assign(new Error("blocked"), {
            name: "DevelopmentWriteBlocked",
          }),
        );
      return Promise.resolve(
        message.type === "clacamieu/dashboard/config"
          ? { room_area_ids: [] }
          : { value: { theme: "dark" } },
      );
    });
    const panel = await mount(hass);
    await act(async () => {
      (
        panel.shadowRoot?.querySelectorAll(
          ".nav-inner button",
        )[4] as HTMLButtonElement
      ).click();
    });
    const toggle = panel.shadowRoot?.querySelector(
      "[role=switch]",
    ) as HTMLButtonElement;
    await act(async () => {
      toggle.click();
    });
    expect(panel.shadowRoot?.querySelector('[role="alert"]')?.textContent).toBe(
      "This action is blocked in development.",
    );
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });
});
