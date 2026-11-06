import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "./panel";
import type { ClacamieuPanel } from "./panel";
import type { DashboardConfig, HassLike } from "./types";

vi.mock("./index.css?inline", () => ({ default: ":host { color: black }" }));
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const panels: ClacamieuPanel[] = [];
const routeListeners: (() => void)[] = [];
afterEach(async () => {
  routeListeners
    .splice(0)
    .forEach((listener) => {
      window.removeEventListener("location-changed", listener);
      window.removeEventListener("popstate", listener);
    });
  history.replaceState(null, "", "/clacamieu");
  await act(async () => {
    panels.splice(0).forEach((panel) => panel.remove());
  });
});
const initial: DashboardConfig = {
  home_cards: [
    { id: "s", type: "power" },
    { id: "a", type: "alarm", entity_id: "alarm_control_panel.example" },
    { id: "r", type: "rooms" },
  ],
  rooms: [{ area_id: "example" }],
};
async function mount(admin = true, readFails = false) {
  let config = structuredClone(initial);
  let reject = false;
  const hass: HassLike = {
    states: {},
    entities: {},
    devices: {},
    panels: {},
    areas: {
      example: { area_id: "example", name: "Example room", icon: null },
    },
    user: { id: "example", name: "Example", is_admin: admin },
    language: "en",
    callService: vi.fn(),
    callWS: vi.fn().mockImplementation(async (message) => {
      if (message.type === "clacamieu/dashboard/config") {
        if (readFails) throw new Error("Dashboard not set up");
        return structuredClone(config);
      }
      if (message.type === "clacamieu/dashboard/config/update") {
        if (reject) throw new Error("failed");
        config = { home_cards: message.home_cards, rooms: message.rooms };
        return structuredClone(config);
      }
      return { value: {} };
    }),
  };
  const panel = document.createElement("clacamieu-panel") as ClacamieuPanel;
  panel.hass = hass;
  const updateRoute = () => {
    panel.route = {
      prefix: "/clacamieu",
      path: location.pathname.replace(/^\/clacamieu/, ""),
    };
  };
  history.replaceState(null, "", "/clacamieu");
  window.addEventListener("location-changed", updateRoute);
  window.addEventListener("popstate", updateRoute);
  routeListeners.push(updateRoute);
  panels.push(panel);
  await act(async () => {
    document.body.append(panel);
  });
  const shadow = panel.shadowRoot!;
  const button = (text: string) =>
    Array.from(shadow.querySelectorAll("button")).find(
      (button) => button.textContent === text,
    )!;
  const clickAndGoBack = async (text: string) => {
    const back = new Promise((resolve) =>
      window.addEventListener("popstate", resolve, { once: true }),
    );
    await act(async () => {
      button(text).click();
      await back;
    });
  };
  const click = async (text: string) => {
    await act(async () => {
      button(text).click();
    });
  };
  return {
    hass,
    shadow,
    click,
    clickAndGoBack,
    button,
    failSave: (value: boolean) => {
      reject = value;
    },
  };
}

describe("configuration flow", () => {
  it("chooses the Home room favorites from the rooms card options", async () => {
    const { shadow, click, clickAndGoBack, hass } = await mount();
    await click("More");
    await click("Configure Maison");
    await act(async () => {
      (
        shadow.querySelector('[aria-label="Edit Rooms"]') as HTMLButtonElement
      ).click();
    });
    const toggle = shadow.querySelector(
      '[role="dialog"] [aria-label="Show Example room"]',
    ) as HTMLButtonElement;
    // A room with nothing to show starts unselected, as Home hides it.
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await act(async () => {
      toggle.click();
    });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await clickAndGoBack("Done");
    expect(
      vi
        .mocked(hass.callWS)
        .mock.calls.filter(([message]) => message.type.endsWith("/update")),
    ).toEqual([
      [
        {
          type: "clacamieu/dashboard/config/update",
          home_cards: [
            initial.home_cards![0],
            initial.home_cards![1],
            { id: "r", type: "rooms", area_ids: ["example"] },
          ],
          rooms: initial.rooms,
        },
      ],
    ]);
    await click("Home");
    expect(
      shadow.querySelector('[aria-label="Open Example room"]'),
    ).not.toBeNull();
  });
  it("hides both configuration entry points from non-admins", async () => {
    const { shadow, click } = await mount(false);
    expect(shadow.textContent).not.toContain("Edit");
    await click("More");
    expect(shadow.textContent).not.toContain("Configure Maison");
  });
  it("offers no editing when the stored settings could not be read", async () => {
    const { shadow, click } = await mount(true, true);
    expect(shadow.querySelector("h1")?.textContent).toBe("Home");
    expect(shadow.textContent).not.toContain("Edit");
    await click("More");
    expect(shadow.textContent).not.toContain("Configure Maison");
  });
  it("discards draft changes, then saves the complete configuration exactly once", async () => {
    const { shadow, click, clickAndGoBack, hass } = await mount();
    await click("More");
    await click("Configure Maison");
    expect(location.pathname).toBe("/clacamieu/configuration");
    expect(shadow.querySelector("nav")).toBeNull();
    await act(async () => {
      (
        shadow.querySelector('[aria-label="Show Plug power"]') as HTMLButtonElement
      ).click();
    });
    await clickAndGoBack("Cancel");
    expect(location.pathname).toBe("/clacamieu/plus");
    expect(
      vi
        .mocked(hass.callWS)
        .mock.calls.filter(([message]) => message.type.endsWith("/update")),
    ).toHaveLength(0);
    await click("Configure Maison");
    await act(async () => {
      (
        shadow.querySelector('[aria-label="Show Plug power"]') as HTMLButtonElement
      ).click();
    });
    await clickAndGoBack("Done");
    expect(location.pathname).toBe("/clacamieu/plus");
    expect(
      vi
        .mocked(hass.callWS)
        .mock.calls.filter(([message]) => message.type.endsWith("/update")),
    ).toEqual([
      [
        {
          type: "clacamieu/dashboard/config/update",
          home_cards: [
            { id: "s", type: "power", hidden: true },
            initial.home_cards![1],
            initial.home_cards![2],
          ],
          rooms: initial.rooms,
        },
      ],
    ]);
    await click("Home");
    expect(shadow.textContent).not.toContain("Plugs");
  });
  it("keeps the draft after a save error and prevents duplicate in-flight writes", async () => {
    const { shadow, click, clickAndGoBack, hass, failSave, button } =
      await mount();
    await click("More");
    await click("Configure Maison");
    await act(async () => {
      (
        shadow.querySelector('[aria-label="Show Alarm"]') as HTMLButtonElement
      ).click();
    });
    failSave(true);
    await act(async () => {
      button("Done").click();
      button("Done").click();
    });
    expect(shadow.querySelector('[role="alert"]')?.textContent).toContain(
      "Unable to save",
    );
    expect(
      vi
        .mocked(hass.callWS)
        .mock.calls.filter(([message]) => message.type.endsWith("/update")),
    ).toHaveLength(1);
    expect(
      shadow
        .querySelector('[aria-label="Show Alarm"]')
        ?.getAttribute("aria-checked"),
    ).toBe("false");
    failSave(false);
    await clickAndGoBack("Done");
    await click("Home");
    expect(shadow.querySelector("h1")?.textContent).toBe("Home");
    expect(shadow.textContent).not.toContain("Alarm disarmed");
  });
  it("requires reset confirmation and only saves the null lists on Done", async () => {
    const { shadow, click, clickAndGoBack, hass } = await mount();
    await click("More");
    await click("Configure Maison");
    await click("Reset to automatic");
    const alert = shadow.querySelector('[role="alertdialog"]')!;
    expect(alert.getRootNode()).toBe(shadow);
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull();
    await act(async () => {
      (
        alert.querySelector(
          '[data-slot="alert-dialog-action"]',
        ) as HTMLButtonElement
      ).click();
    });
    expect(
      vi
        .mocked(hass.callWS)
        .mock.calls.filter(([message]) => message.type.endsWith("/update")),
    ).toHaveLength(0);
    await clickAndGoBack("Done");
    expect(
      vi
        .mocked(hass.callWS)
        .mock.calls.filter(([message]) => message.type.endsWith("/update")),
    ).toEqual([
      [
        {
          type: "clacamieu/dashboard/config/update",
          home_cards: null,
          rooms: null,
        },
      ],
    ]);
  });
});
