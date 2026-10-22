import { describe, expect, it, vi } from "vitest";
import {
  buildEnergyView,
  energyRange,
  type EnergyHistory,
  type EnergyPrefs,
  type StatisticPoint,
} from "./energy-view";
import type { HassEntity, HassLike } from "./types";

const now = new Date("2026-10-21T12:30:00Z");
const zone = "Europe/Brussels";
const range = energyRange("day", now, zone);
const point = (hour: number, change: number | null): StatisticPoint => ({
  start: range.start + hour * 3_600_000,
  end: range.start + (hour + 1) * 3_600_000,
  change,
});
const prefs: EnergyPrefs = {
  energy_sources: [
    {
      type: "grid",
      flow_from: [
        { stat_energy_from: "sensor.grid", number_energy_price: 0.3 },
      ],
    },
  ],
  device_consumption: [
    { stat_consumption: "sensor.appliance_energy" },
    { stat_consumption: "external:meter" },
    { stat_consumption: "sensor.offline" },
  ],
};
function entity(
  id: string,
  state: string,
  attributes: HassEntity["attributes"] = {},
): HassEntity {
  return {
    entity_id: id,
    state,
    attributes,
    last_changed: "",
    last_updated: "",
    context: { id: "test", parent_id: null, user_id: null },
  };
}
function hass(): HassLike {
  return {
    states: {
      "sensor.appliance_energy": entity("sensor.appliance_energy", "123", {
        friendly_name: "Appliance",
      }),
      "sensor.appliance_power": entity("sensor.appliance_power", ".12", {
        device_class: "power",
        unit_of_measurement: "kW",
      }),
      "switch.appliance": entity("switch.appliance", "on"),
      "sensor.other_power": entity("sensor.other_power", "600", {
        device_class: "power",
        unit_of_measurement: "W",
      }),
    },
    entities: {
      "sensor.appliance_energy": {
        entity_id: "sensor.appliance_energy",
        device_id: "device_a",
      },
      "sensor.appliance_power": {
        entity_id: "sensor.appliance_power",
        device_id: "device_a",
      },
      "switch.appliance": {
        entity_id: "switch.appliance",
        device_id: "device_a",
      },
    },
    devices: {},
    areas: {},
    panels: {},
    language: "en",
    config: { time_zone: zone },
    user: { id: "user", name: "User", is_admin: false },
    callWS: vi.fn(),
    callService: vi.fn(),
  };
}
function history(): EnergyHistory {
  return {
    current: {
      "sensor.grid": [point(0, 2), point(2, 4), point(3, null)],
      "sensor.appliance_energy": [point(0, 1), point(2, 2)],
      "external:meter": [point(0, 0.5)],
    },
    previous: {
      "sensor.grid": [
        {
          start: range.previousStart,
          end: range.previousStart + 3_600_000,
          change: 4,
        },
      ],
    },
    metadata: [
      {
        statistic_id: "external:meter",
        name: "Imported meter",
        unit_of_measurement: "kWh",
      },
    ],
  };
}
describe("energy view", () => {
  it.each(["day", "week", "month", "year"] as const)(
    "ignores uncompiled current %s buckets",
    (period) => {
      const instant = new Date("2026-01-01T23:30:00Z");
      const window = energyRange(period, instant, zone);
      const current = window.boundaries
        .slice(0, -1)
        .map((start, index) => ({
          start,
          end: window.boundaries[index + 1],
          change: 1,
        }))
        .filter((point) => point.end <= instant.getTime());
      const config = { device_consumption: [{ stat_consumption: "meter" }] };
      const view = buildEnergyView(
        config,
        { current: { meter: current }, previous: {}, metadata: [] },
        hass(),
        period,
        instant,
      );
      expect(view.partial).toBe(false);
      expect(view.buckets.find((bucket) => bucket.current)?.kwh).toBeNull();
      if (current.length)
        expect(
          buildEnergyView(
            config,
            {
              current: { meter: current.slice(1) },
              previous: {},
              metadata: [],
            },
            hass(),
            period,
            instant,
          ).partial,
        ).toBe(true);
    },
  );
  it.each([
    ["EUR/kWh", ".3"],
    ["EUR/MWh", "300"],
    ["EUR/Wh", ".0003"],
    [undefined, ".3"],
  ])("converts entity price %s to per kWh", (unit, state) => {
    const source = hass();
    source.states["sensor.price"] = entity("sensor.price", state!, {
      unit_of_measurement: unit,
    });
    const config: EnergyPrefs = {
      ...prefs,
      energy_sources: [
        {
          type: "grid",
          stat_energy_from: "sensor.grid",
          entity_energy_price: "sensor.price",
        },
      ],
    };
    expect(
      buildEnergyView(config, history(), source, "day", now).cost,
    ).toBeCloseTo(1.8);
  });
  it("excludes included devices from totals, chart, and shares while keeping their rows", () => {
    const config = {
      device_consumption: [
        { stat_consumption: "parent", name: "Parent" },
        { stat_consumption: "child", included_in_stat: "parent" },
        { stat_consumption: "other", included_in_stat: "unmeasured" },
      ],
    };
    const view = buildEnergyView(
      config,
      {
        current: {
          parent: [point(0, 4)],
          child: [point(0, 3)],
          other: [point(0, 1)],
        },
        previous: {},
        metadata: [],
      },
      hass(),
      "day",
      now,
    );
    expect(view.kwh).toBe(5);
    expect(view.buckets[0].kwh).toBe(5);
    expect(view.devices.find((device) => device.id === "parent")?.share).toBe(
      80,
    );
    expect(view.devices.find((device) => device.id === "child")).toMatchObject({
      kwh: 3,
      share: null,
      includedIn: "Parent",
    });
  });
  it("shows device total cost when prices agree and hides all costs when they differ", () => {
    const data = history();
    data.current["sensor.grid"] = [];
    data.previous["sensor.grid"] = [];
    const view = buildEnergyView(prefs, data, hass(), "day", now);
    expect(view.cost).toBeCloseTo(1.05);
    expect(view.devices[0].cost).toBeCloseTo(0.9);
    const config: EnergyPrefs = {
      ...prefs,
      energy_sources: [
        {
          type: "grid",
          flow_from: [
            { stat_energy_from: "sensor.grid", number_energy_price: 0.3 },
            { stat_energy_from: "other_grid", number_energy_price: 0.4 },
          ],
        },
      ],
    };
    const unknown = buildEnergyView(config, data, hass(), "day", now);
    expect(unknown.cost).toBeNull();
    expect(unknown.devices.every((device) => device.cost === null)).toBe(true);
  });
  it("uses the largest power reading instead of adding phases and total", () => {
    const source = hass();
    source.states["sensor.phase"] = entity("sensor.phase", "50", {
      device_class: "power",
      unit_of_measurement: "W",
    });
    source.entities["sensor.phase"] = {
      entity_id: "sensor.phase",
      device_id: "device_a",
    };
    expect(
      buildEnergyView(prefs, history(), source, "day", now).devices[0].watts,
    ).toBe(120);
  });
  it("compares the same elapsed day rather than the entire previous day", () => {
    const data = history();
    data.previous["sensor.grid"].push({
      start: range.previousStart + 20 * 3_600_000,
      end: range.previousStart + 21 * 3_600_000,
      change: 100,
    });
    expect(buildEnergyView(prefs, data, hass(), "day", now).change).toBe(50);
  });

  it("uses grid changes, preserves missing buckets, and sorts measured devices", () => {
    const view = buildEnergyView(prefs, history(), hass(), "day", now);
    expect(view.kwh).toBe(6);
    expect(view.cost).toBeCloseTo(1.8);
    expect(view.change).toBe(50);
    expect(view.watts).toBe(120);
    expect(view.buckets).toHaveLength(24);
    expect(view.buckets.slice(0, 4).map((bucket) => bucket.kwh)).toEqual([
      2,
      null,
      4,
      null,
    ]);
    expect(view.buckets.find((bucket) => bucket.current)?.start).toBe(
      Date.parse("2026-10-21T12:00:00Z"),
    );
    expect(view.partial).toBe(true);
    expect(view.devices).toEqual([
      {
        id: "sensor.appliance_energy",
        name: "Appliance",
        includedIn: null,
        kwh: 3,
        share: 50,
        watts: 120,
        cost: 3 * 0.3,
      },
      {
        id: "external:meter",
        name: "Imported meter",
        includedIn: null,
        kwh: 0.5,
        share: (0.5 / 6) * 100,
        watts: null,
        cost: 0.15,
      },
      {
        id: "sensor.offline",
        name: "sensor.offline",
        includedIn: null,
        kwh: null,
        share: null,
        watts: null,
        cost: null,
      },
    ]);
  });
  it("reads flat grid import preferences from current Home Assistant", () => {
    const flat: EnergyPrefs = {
      ...prefs,
      energy_sources: [
        {
          type: "grid",
          stat_energy_from: "sensor.grid",
          number_energy_price: 0.3,
        },
      ],
    };
    expect(buildEnergyView(flat, history(), hass(), "day", now).kwh).toBe(6);
    expect(
      buildEnergyView(flat, history(), hass(), "day", now).cost,
    ).toBeCloseTo(1.8);
  });
  it("resolves an entity price and removes costs when it is unavailable", () => {
    const source = hass();
    source.states["input_number.price"] = entity("input_number.price", ".42");
    const entityPrefs: EnergyPrefs = {
      ...prefs,
      energy_sources: [
        {
          type: "grid",
          flow_from: [
            {
              stat_energy_from: "sensor.grid",
              entity_energy_price: "input_number.price",
              number_energy_price: 9,
            },
          ],
        },
      ],
    };
    expect(
      buildEnergyView(entityPrefs, history(), source, "day", now).cost,
    ).toBeCloseTo(2.52);
    expect(
      buildEnergyView(entityPrefs, history(), source, "day", now).devices[0]
        .cost,
    ).toBeCloseTo(1.26);
    source.states["input_number.price"].state = "unavailable";
    expect(
      buildEnergyView(entityPrefs, history(), source, "day", now).cost,
    ).toBeNull();
    expect(
      buildEnergyView(entityPrefs, history(), source, "day", now).devices[0]
        .cost,
    ).toBeNull();
  });
  it("sums grid tariffs with their own prices without inventing a device price", () => {
    const multi: EnergyPrefs = {
      ...prefs,
      energy_sources: [
        {
          type: "grid",
          flow_from: [
            { stat_energy_from: "sensor.grid", number_energy_price: 0.2 },
            { stat_energy_from: "sensor.night", number_energy_price: 0.1 },
          ],
        },
      ],
    };
    const data = history();
    data.current["sensor.night"] = [point(0, 2)];
    const view = buildEnergyView(multi, data, hass(), "day", now);
    expect(view.kwh).toBe(8);
    expect(view.cost).toBeCloseTo(1.4);
    expect(view.devices[0].cost).toBeNull();
  });
  it("uses measured devices when no grid import is configured", () => {
    const view = buildEnergyView(
      { device_consumption: prefs.device_consumption },
      history(),
      hass(),
      "day",
      now,
    );
    expect(view.kwh).toBe(3.5);
    expect(view.cost).toBeNull();
    expect(view.change).toBeNull();
  });
  it("does not replace a missing grid reading with measured device totals", () => {
    const data = history();
    data.current["sensor.grid"] = [];
    const view = buildEnergyView(prefs, data, hass(), "day", now);
    expect(view.kwh).toBeNull();
    expect(view.cost).toBeNull();
    expect(view.devices[0].share).toBeNull();
  });
  it("keeps actual zero readings distinct from missing data", () => {
    const data = history();
    data.current["sensor.grid"] = [point(0, 0)];
    const view = buildEnergyView(prefs, data, hass(), "day", now);
    expect(view.source).toBe("grid");
    expect(view.kwh).toBe(0);
    expect(view.cost).toBe(0);
    expect(view.buckets[0].kwh).toBe(0);
    expect(view.buckets[1].kwh).toBeNull();
    expect(view.change).toBe(-100);
  });
  it("adds up measured devices when the grid statistic has no reading in either period", () => {
    const data = history();
    data.current["sensor.grid"] = [point(0, 0), point(2, 0)];
    data.previous["sensor.grid"][0].change = 0;
    const view = buildEnergyView(prefs, data, hass(), "day", now);
    expect(view.source).toBe("devices");
    expect(view.kwh).toBe(3.5);
    expect(view.cost).toBeCloseTo(1.05);
    expect(view.buckets[0].kwh).toBe(1.5);
  });
  it("renders an empty preferences object without requiring the Clacamieu Energy family", () => {
    const view = buildEnergyView(
      {},
      { current: {}, previous: {}, metadata: [] },
      hass(),
      "day",
      now,
    );
    expect(view.configured).toBe(false);
    expect(view.kwh).toBeNull();
    expect(view.devices).toEqual([]);
  });
});
describe("energy calendar ranges", () => {
  it.each([
    ["day", "2026-10-20T22:00:00.000Z", "2026-10-21T22:00:00.000Z", 24],
    ["week", "2026-10-14T22:00:00.000Z", "2026-10-21T22:00:00.000Z", 7],
    ["month", "2026-09-30T22:00:00.000Z", "2026-10-31T23:00:00.000Z", 31],
    ["year", "2025-12-31T23:00:00.000Z", "2026-12-31T23:00:00.000Z", 12],
  ] as const)(
    "uses Home Assistant's time zone for %s",
    (period, start, end, count) => {
      const result = energyRange(period, now, zone);
      expect(new Date(result.start).toISOString()).toBe(start);
      expect(new Date(result.end).toISOString()).toBe(end);
      expect(result.boundaries).toHaveLength(count + 1);
      if (period === "week") expect(result.previousEnd).toBe(result.start);
    },
  );
  it("keeps the last day of a month within that month", () => {
    expect(
      new Date(
        energyRange("month", new Date("2026-10-31T15:00:00Z"), zone).end,
      ).toISOString(),
    ).toBe("2026-10-31T23:00:00.000Z");
  });
  it.each([
    ["2026-03-29T12:00:00Z", 23],
    ["2026-10-25T12:00:00Z", 25],
  ] as const)("preserves DST hours on %s", (date, count) => {
    const range = energyRange("day", new Date(date), zone);
    expect(range.boundaries).toHaveLength(count + 1);
    expect(range.end - range.start).toBe(count * 3_600_000);
  });
  it("uses the HA date even when the browser date is different", () => {
    expect(
      new Date(
        energyRange("day", new Date("2026-10-20T23:00:00Z"), zone).start,
      ).toISOString(),
    ).toBe("2026-10-20T22:00:00.000Z");
  });
});

describe("elapsed comparison windows", () => {
  it.each([
    ["2026-10-26T01:30:00Z", "2026-10-25T00:30:00.000Z"],
    ["2026-03-30T00:30:00Z", "2026-03-29T01:30:00.000Z"],
  ])("resolves repeated and skipped previous clock times for %s", (instant, end) => {
    expect(new Date(energyRange("day", new Date(instant), zone).previousEnd).toISOString()).toBe(end);
  });

  it.each([
    [
      "day",
      "2026-10-21T12:30:00Z",
      "2026-10-19T22:00:00.000Z",
      "2026-10-20T12:30:00.000Z",
    ],
    [
      "month",
      "2026-10-21T12:30:00Z",
      "2026-08-31T22:00:00.000Z",
      "2026-09-21T12:30:00.000Z",
    ],
    [
      "month",
      "2026-03-31T12:30:00Z",
      "2026-01-31T23:00:00.000Z",
      "2026-02-28T13:30:00.000Z",
    ],
    [
      "year",
      "2024-02-29T12:30:00Z",
      "2022-12-31T23:00:00.000Z",
      "2023-02-28T12:30:00.000Z",
    ],
    [
      "day",
      "2026-10-25T12:30:00Z",
      "2026-10-23T22:00:00.000Z",
      "2026-10-24T11:30:00.000Z",
    ],
    [
      "day",
      "2026-03-29T12:30:00Z",
      "2026-03-27T23:00:00.000Z",
      "2026-03-28T13:30:00.000Z",
    ],
  ] as const)(
    "compares %s at %s using the local clock",
    (period, instant, start, end) => {
      const window = energyRange(period, new Date(instant), zone);
      expect(new Date(window.previousStart).toISOString()).toBe(start);
      expect(new Date(window.previousEnd).toISOString()).toBe(end);
    },
  );
});
