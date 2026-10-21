import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Energy } from "./components/energy";
import type { HassLike } from "./types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
let hass: HassLike;
const now = new Date("2026-10-21T12:00:00Z");
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  hass = {
    states: {},
    entities: {},
    devices: {},
    areas: {},
    panels: {},
    user: { id: "reader", name: "Reader", is_admin: false },
    language: "en",
    config: { time_zone: "Europe/Brussels" },
    callService: vi.fn(),
    callWS: vi.fn().mockImplementation(async (message) => {
      if (message.type === "energy/get_prefs")
        return {
          energy_sources: [
            {
              type: "grid",
              stat_energy_from: "external:grid",
              number_energy_price: 0.4,
            },
          ],
        };
      if (message.type === "recorder/get_statistics_metadata")
        return [
          {
            statistic_id: "external:grid",
            name: "Grid",
            unit_of_measurement: "kWh",
          },
        ];
      if (message.type === "recorder/statistics_during_period")
        return {
          "external:grid": [
            {
              start: Date.parse(message.start_time),
              end: Date.parse(message.start_time) + 3_600_000,
              change: 2,
            },
          ],
        };
      throw new Error("Unexpected call");
    }),
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});
const mount = () => act(async () => root.render(<Energy hass={hass} />));
const requests = () =>
  vi
    .mocked(hass.callWS)
    .mock.calls.map(([message]) => message)
    .filter((message) => message.type === "recorder/statistics_during_period");

describe("energy screen and loading", () => {
  it("loads both ranges in kWh, metadata, and refreshes after five minutes for a non-admin", async () => {
    await mount();
    expect(requests()).toHaveLength(2);
    expect(requests()[0]).toEqual({
      type: "recorder/statistics_during_period",
      statistic_ids: ["external:grid"],
      start_time: "2026-10-20T22:00:00.000Z",
      end_time: "2026-10-21T22:00:00.000Z",
      period: "hour",
      types: ["change"],
      units: { energy: "kWh" },
    });
    expect(requests()[1].end_time).toBe(requests()[0].start_time);
    expect(container.textContent).toContain("2 kWh");
    expect(container.textContent).toContain("€0.80");
    expect(container.textContent).toContain("+0 %");
    await act(async () => vi.advanceTimersByTime(300_000));
    expect(requests()).toHaveLength(4);
    expect(hass.callService).not.toHaveBeenCalled();
  });
  it.each([
    ["Week", "day", 7],
    ["Month", "day", 31],
    ["Year", "month", 12],
  ])("reloads %s buckets on period change", async (label, period, count) => {
    await mount();
    const button = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent === label)!;
    await act(async () => button.click());
    expect(requests()).toHaveLength(4);
    expect(requests()[2].period).toBe(period);
    expect(container.querySelectorAll('svg [role="button"]')).toHaveLength(
      count,
    );
    expect(button.getAttribute("aria-checked")).toBe("true");
  });
  it.each(["empty", "failure"])(
    "links to HA Energy settings for %s preferences",
    async (mode) => {
      vi.mocked(hass.callWS).mockImplementation(async () => {
        if (mode === "failure") throw new Error("No prefs");
        return {} as never;
      });
      await mount();
      expect(container.querySelector("a")?.getAttribute("href")).toBe(
        "/config/energy",
      );
      expect(requests()).toHaveLength(0);
    },
  );
  it("offers retry after a statistics failure", async () => {
    const original = hass.callWS;
    hass.callWS = vi.fn().mockImplementation(async (message) => {
      if (message.type === "recorder/statistics_during_period")
        throw new Error("Offline");
      return original(message);
    });
    await mount();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Unable to load",
    );
    const retry = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent === "Try again")!;
    const count = requests().length;
    await act(async () => retry.click());
    expect(requests()).toHaveLength(count + 2);
  });
  it("shows a selected bar's value with tap and keyboard access", async () => {
    await mount();
    const bar = container.querySelector<SVGGElement>('svg [role="button"]')!;
    expect(bar.getAttribute("aria-label")).toContain("2 kWh");
    await act(async () =>
      bar.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    expect(bar.getAttribute("aria-pressed")).toBe("true");
    expect(
      container.querySelector('[aria-live="polite"]')?.textContent,
    ).toContain("2 kWh");
    const nextBar = container.querySelectorAll('svg [role="button"]')[1];
    await act(async () =>
      nextBar.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    expect(nextBar.getAttribute("aria-pressed")).toBe("true");
    expect(
      container.querySelector('[aria-live="polite"]')?.textContent,
    ).toContain("No data");
  });
  it("ignores a response that arrives after leaving the screen", async () => {
    let resolve!: (value: unknown) => void;
    hass.callWS = vi.fn().mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await mount();
    await act(async () => root.render(<p>Other screen</p>));
    await act(async () => resolve({}));
    expect(container.textContent).toBe("Other screen");
    expect(hass.callWS).toHaveBeenCalledTimes(1);
  });
});
