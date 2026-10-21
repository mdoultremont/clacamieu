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
  vi.unstubAllGlobals();
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
      "Home",
    );
    expect(panel.shadowRoot?.textContent).toContain("Room A");
    expect(panel.shadowRoot?.textContent).toContain("No sensors");
    expect(
      panel.shadowRoot?.querySelectorAll(".nav-inner button:disabled"),
    ).toHaveLength(3);
  });
  it("renders saved card order and calls homeassistant.toggle from an entity row", async () => {
    const hass = fixture();
    hass.states["switch.example"] = {
      entity_id: "switch.example",
      state: "off",
      attributes: { friendly_name: "Example switch" },
      last_changed: "",
      last_updated: "",
      context: { id: "test", parent_id: null, user_id: null },
    };
    hass.callWS = vi.fn().mockResolvedValue({
      home_cards: [
        {
          id: "e",
          type: "entities",
          title: "Devices",
          entity_ids: ["switch.example", "sensor.missing", "light.missing"],
        },
        { id: "s", type: "summary" },
      ],
      rooms: [],
    });
    const panel = await mount(hass);
    const content = panel.shadowRoot!.querySelector(".page-content")!;
    expect(content.querySelector("section h2")?.textContent).toBe("Devices");
    expect(content.textContent).toContain("sensor.missing");
    expect(content.textContent).toContain("Unavailable");
    expect(
      panel
        .shadowRoot!.querySelector('[aria-label="light.missing"]')
        ?.hasAttribute("disabled"),
    ).toBe(true);
    expect(content.querySelectorAll("h2")).toHaveLength(1);
    await act(async () => {
      (
        panel.shadowRoot!.querySelector("label[for]") as HTMLLabelElement
      ).click();
    });
    expect(hass.callService).toHaveBeenCalledExactlyOnceWith(
      "homeassistant",
      "toggle",
      {},
      { entity_id: "switch.example" },
    );
  });
  it("uses new hass snapshots and preserves the root and tab across reconnects", async () => {
    const hass = fixture();
    const panel = await mount(hass);
    const root = panel.shadowRoot?.querySelector("#root");
    await act(async () => {
      panel.hass = { ...hass, language: "fr" };
    });
    expect(panel.shadowRoot?.querySelector("h1")?.textContent).toContain(
      "Accueil",
    );
    await act(async () => {
      (
        panel.shadowRoot?.querySelectorAll(
          ".nav-inner button",
        )[4] as HTMLButtonElement
      ).click();
    });
    expect(panel.shadowRoot?.querySelector("h1")?.textContent).toBe("Plus");
    await act(async () => {
      panel.remove();
      document.body.append(panel);
    });
    expect(panel.shadowRoot?.querySelector("#root")).toBe(root);
    expect(panel.shadowRoot?.querySelector("h1")?.textContent).toBe("Plus");
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
        panel.shadowRoot?.querySelector(
          "button[data-slot=item]",
        ) as HTMLButtonElement
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
          ? { home_cards: null, rooms: null }
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
      toggle.closest("label")!.click();
    });
    expect(panel.shadowRoot?.querySelector('[role="alert"]')?.textContent).toBe(
      "This action is blocked in development.",
    );
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });
  it("follows Home Assistant dark mode and otherwise tracks the system scheme", async () => {
    let matches = true;
    const listeners = new Set<() => void>();
    const remove = vi.fn((_: string, listener: () => void) =>
      listeners.delete(listener),
    );
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        get matches() {
          return matches;
        },
        addEventListener: (_: string, listener: () => void) =>
          listeners.add(listener),
        removeEventListener: remove,
      })),
    );
    const hass = fixture();
    const panel = await mount(hass);
    expect(panel.dataset.theme).toBe("dark");
    expect(
      panel.shadowRoot
        ?.querySelector("#portal-container")
        ?.classList.contains("dark"),
    ).toBe(true);
    await act(async () => {
      panel.hass = { ...hass, themes: { darkMode: false } };
    });
    expect(panel.dataset.theme).toBe("light");
    listeners.forEach((listener) => listener());
    expect(panel.dataset.theme).toBe("light");
    await act(async () => {
      panel.hass = { ...hass, themes: { darkMode: true } };
    });
    matches = false;
    listeners.forEach((listener) => listener());
    expect(panel.dataset.theme).toBe("dark");
    await act(async () => {
      panel.hass = hass;
    });
    expect(panel.dataset.theme).toBe("light");
    matches = true;
    listeners.forEach((listener) => listener());
    expect(panel.dataset.theme).toBe("dark");
    expect(
      panel.shadowRoot?.querySelector("#root")?.classList.contains("dark"),
    ).toBe(true);
    await act(async () => {
      panel.remove();
    });
    expect(remove).toHaveBeenCalled();
    expect(listeners.size).toBe(0);
    await act(async () => {
      document.body.append(panel);
    });
    expect(listeners.size).toBe(1);
  });
  it("renders openings and leaks as destructive outline badges", async () => {
    const hass = fixture();
    for (const [id, state, deviceClass] of [
      ["alarm_control_panel.example", "disarmed", undefined],
      ["binary_sensor.door", "on", "door"],
      ["binary_sensor.leak", "on", "moisture"],
    ] as const)
      hass.states[id] = {
        entity_id: id,
        state,
        attributes: { device_class: deviceClass },
        last_changed: "",
        last_updated: "",
        context: { id: "test", parent_id: null, user_id: null },
      };
    const panel = await mount(hass);
    const badges = panel.shadowRoot!.querySelectorAll('[data-slot="badge"]');
    expect(Array.from(badges, (badge) => badge.textContent)).toEqual([
      "1 open",
      "leak detected",
    ]);
    for (const badge of badges) {
      expect(badge.getAttribute("data-variant")).toBe("outline");
      expect(badge.classList.contains("text-destructive")).toBe(true);
    }
    const arm = Array.from(panel.shadowRoot!.querySelectorAll("button")).find(
      (button) => button.textContent === "Arm",
    )!;
    expect(arm.getAttribute("data-variant")).toBe("outline");
    await act(async () => {
      arm.click();
    });
    expect(hass.callService).toHaveBeenCalledExactlyOnceWith(
      "alarm_control_panel",
      "alarm_arm_away",
      {},
      { entity_id: "alarm_control_panel.example" },
    );
  });
});
