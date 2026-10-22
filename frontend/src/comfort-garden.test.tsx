import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "./panel";
import type { ClacamieuPanel } from "./panel";
import type { HassLike } from "./types";

vi.mock("./index.css?inline", () => ({ default: ":host { color: black }" }));
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const panels: ClacamieuPanel[] = [];
afterEach(async () => {
  await act(async () => {
    panels.splice(0).forEach((panel) => panel.remove());
  });
});

function fixture(): HassLike {
  const hass: HassLike = {
    states: {},
    entities: {},
    devices: {},
    panels: {},
    areas: { room: { area_id: "room", name: "Example room", icon: null } },
    user: { id: "example", name: "Example", is_admin: false },
    language: "en",
    callService: vi.fn().mockResolvedValue(undefined),
    callWS: vi
      .fn()
      .mockImplementation(async (message) =>
        message.type === "clacamieu/dashboard/config"
          ? { rooms: null, home_cards: null }
          : { value: {} },
      ),
  };
  for (const [id, state, attributes] of [
    ["sensor.temperature", "20", { device_class: "temperature" }],
    ["sensor.humidity", "80", { device_class: "humidity" }],
    ["sensor.co2", "1500", { device_class: "carbon_dioxide" }],
    [
      "weather.example",
      "cloudy",
      { supported_features: 1, temperature: 14, humidity: 70 },
    ],
    [
      "valve.example",
      "closed",
      { supported_features: 3, friendly_name: "Watering" },
    ],
  ] as const) {
    hass.states[id] = {
      entity_id: id,
      state,
      attributes,
      last_changed: "",
      last_updated: "",
      context: { id: "example", parent_id: null, user_id: null },
    };
    hass.entities[id] = { entity_id: id, area_id: "room" };
  }
  return hass;
}
async function mount(hass: HassLike, path: string) {
  const panel = document.createElement("clacamieu-panel") as ClacamieuPanel;
  panel.hass = hass;
  panel.panel = { url_path: "clacamieu", title: "Maison" };
  panel.narrow = true;
  panel.route = { prefix: "/clacamieu", path };
  panels.push(panel);
  await act(async () => {
    document.body.append(panel);
  });
  return panel;
}
async function click(panel: ClacamieuPanel, text: string) {
  const button = [...panel.shadowRoot!.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === text,
  );
  expect(button, text).toBeTruthy();
  await act(async () => {
    button!.click();
  });
}

describe("Plus climate pages", () => {
  it("shows only supported pages in the Maison group and filters comfort values", async () => {
    const hass = fixture();
    const panel = await mount(hass, "/plus");
    expect(
      panel.shadowRoot!.querySelector('a[href="/clacamieu/plus/confort"]'),
    ).not.toBeNull();
    expect(
      panel.shadowRoot!.querySelector('a[href="/clacamieu/plus/jardin"]'),
    ).not.toBeNull();
    await act(async () => {
      panel.route = { prefix: "/clacamieu", path: "/plus/confort" };
    });
    expect(panel.shadowRoot!.textContent).toContain(
      "Indoor average · 20°C · 80 %",
    );
    expect(
      panel.shadowRoot!.querySelector('a[href="/clacamieu/pieces/room"]')
        ?.textContent,
    ).toContain("High CO₂");
    await click(panel, "CO₂");
    expect(
      panel.shadowRoot!.querySelector('[data-slot="item-actions"]')
        ?.textContent,
    ).toBe("1,500 ppm");
    expect(
      panel.shadowRoot!.querySelector('nav button[aria-current="page"]')
        ?.textContent,
    ).toBe("More");
    await act(async () => {
      panel.hass = { ...hass, states: {} };
      panel.route = { prefix: "/clacamieu", path: "/plus" };
    });
    expect(
      panel.shadowRoot!.querySelector('a[href="/clacamieu/plus/confort"]'),
    ).toBeNull();
    expect(
      panel.shadowRoot!.querySelector('a[href="/clacamieu/plus/jardin"]'),
    ).toBeNull();
  });
  it("subscribes once, renders updates, forwards valve controls and unsubscribes on leaving", async () => {
    const hass = fixture();
    const stop = vi.fn().mockResolvedValue(undefined);
    let receive: ((event: unknown) => void) | undefined;
    const subscribeMessage = vi.fn().mockImplementation(async (callback) => {
      receive = callback;
      return stop;
    });
    hass.connection = { subscribeMessage };
    const panel = await mount(hass, "/plus/jardin");
    expect(subscribeMessage).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
      {
        type: "weather/subscribe_forecast",
        entity_id: "weather.example",
        forecast_type: "daily",
      },
    );
    await act(async () => {
      receive!({
        forecast: [
          {
            datetime: "2026-10-22T12:00:00Z",
            condition: "sunny",
            temperature: 15,
            templow: 7,
          },
        ],
      });
      panel.hass = { ...hass };
    });
    expect(panel.shadowRoot!.textContent).toContain("Sunny");
    expect(subscribeMessage).toHaveBeenCalledTimes(1);
    await click(panel, "Open");
    expect(hass.callService).toHaveBeenCalledExactlyOnceWith(
      "valve",
      "open_valve",
      {},
      { entity_id: "valve.example" },
    );
    vi.mocked(hass.callService).mockRejectedValueOnce(
      new Error("Service denied"),
    );
    await click(panel, "Close");
    expect(
      panel.shadowRoot!.querySelector('[role="alert"]')?.textContent,
    ).toContain("The action failed");
    await act(async () => {
      panel.route = { prefix: "/clacamieu", path: "/plus" };
    });
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it("cleans up a subscription that resolves after unmount", async () => {
    const hass = fixture();
    let resolve: ((stop: () => Promise<void>) => void) | undefined;
    const stop = vi.fn().mockResolvedValue(undefined);
    hass.connection = {
      subscribeMessage: vi.fn().mockImplementation(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      ),
    };
    const panel = await mount(hass, "/plus/jardin");
    await act(async () => {
      panel.remove();
    });
    await act(async () => {
      resolve!(stop);
    });
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it("releases the forecast on panel removal and subscribes again on reconnection", async () => {
    const hass = fixture();
    const stop = vi.fn().mockResolvedValue(undefined);
    const subscribeMessage = vi.fn().mockResolvedValue(stop);
    hass.connection = { subscribeMessage };
    const panel = await mount(hass, "/plus/jardin");
    const root = panel.shadowRoot!.querySelector("#root");
    await act(async () => {
      panel.remove();
    });
    expect(stop).toHaveBeenCalledTimes(1);
    await act(async () => {
      document.body.append(panel);
    });
    expect(subscribeMessage).toHaveBeenCalledTimes(2);
    expect(panel.shadowRoot!.querySelector("#root")).toBe(root);
    expect(
      panel.shadowRoot!.querySelectorAll("#portal-container"),
    ).toHaveLength(1);
  });
  it("shows a forecast error and does not subscribe without daily support", async () => {
    const hass = fixture();
    const subscribeMessage = vi
      .fn()
      .mockRejectedValue(new Error("Forecast denied"));
    hass.connection = { subscribeMessage };
    const panel = await mount(hass, "/plus/jardin");
    expect(panel.shadowRoot!.textContent).toContain("Forecast unavailable");
    await act(async () => {
      panel.remove();
    });
    hass.states["weather.example"].attributes.supported_features = 2;
    const unsupported = await mount(hass, "/plus/jardin");
    expect(subscribeMessage).toHaveBeenCalledTimes(1);
    expect(unsupported.shadowRoot!.textContent).not.toContain("5-day forecast");
  });
});
