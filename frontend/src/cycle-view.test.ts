import { describe, expect, it } from "vitest";
import {
  buildCycleChips,
  cycleDetail,
  cycleTracker,
  detectCycle,
  formatElapsed,
  parseCycleDismissals,
  powerSamples,
  trackedCycle,
  type CycleAppliance,
  type PowerSample,
} from "./cycle-view";
import type { HassLike } from "./types";

const minute = 60_000;
const start = Date.UTC(2026, 10, 8, 9, 0);
/** Watts held from each minute offset until the next one. */
const trace = (steps: [number, number | null][]): PowerSample[] =>
  steps.map(([at, watts]) => ({ at: start + at * minute, watts }));
const at = (minutes: number) => start + minutes * minute;

describe("detectCycle", () => {
  it("stays idle on standby draw", () => {
    expect(detectCycle(trace([[0, 0.3], [30, 1.8], [60, 0.1]]), at(90))).toEqual({
      status: "idle",
    });
  });

  it("keeps a washing machine running through dips shorter than the grace period", () => {
    const washer = trace([
      [0, 0.3],
      [10, 2000],
      [25, 60],
      [40, 0.4],
      [44, 450],
      [70, 0.3],
    ]);
    expect(detectCycle(washer, at(75))).toEqual({
      status: "running",
      since: at(10),
      watts: 0.3,
      kwh: expect.closeTo((2000 * 15 + 60 * 15 + 0.4 * 4 + 450 * 26 + 0.3 * 5) / 60_000),
    });
  });

  it("ends a cycle where power dropped once it stays low for ten minutes", () => {
    const dishwasher = trace([
      [0, 0.1],
      [5, 2000],
      [35, 3],
      [40, 2000],
      [90, 0.1],
    ]);
    expect(detectCycle(dishwasher, at(99))).toMatchObject({ status: "running" });
    expect(detectCycle(dishwasher, at(100))).toEqual({
      status: "finished",
      startedAt: at(5),
      endedAt: at(90),
      kwh: expect.closeTo((2000 * 30 + 3 * 5 + 2000 * 50) / 60_000),
    });
  });

  it("shows a finished cycle for six hours, then goes idle", () => {
    const samples = trace([[0, 1500], [60, 0]]);
    expect(detectCycle(samples, at(60 + 359)).status).toBe("finished");
    expect(detectCycle(samples, at(60 + 360)).status).toBe("idle");
  });

  it("reports only the latest of two cycles", () => {
    const samples = trace([[0, 1500], [30, 0], [120, 900], [150, 0]]);
    expect(detectCycle(samples, at(200))).toMatchObject({
      status: "finished",
      startedAt: at(120),
      endedAt: at(150),
    });
  });

  it("neither starts nor ends a cycle while the plug is unavailable", () => {
    expect(
      detectCycle(trace([[0, 1500], [10, null]]), at(60)),
    ).toMatchObject({ status: "running", since: at(0) });
    expect(detectCycle(trace([[0, null]]), at(60)).status).toBe("idle");
  });
});

describe("powerSamples", () => {
  it("reads history points in watts and drops unknown states to null", () => {
    expect(
      powerSamples(
        [
          { s: "1.2", lu: 100 },
          { s: "unavailable", lu: 160 },
        ],
        "kW",
      ),
    ).toEqual([
      { at: 100_000, watts: 1200 },
      { at: 160_000, watts: null },
    ]);
  });
});

describe("cycle labels", () => {
  it("describes running and finished cycles in one line", () => {
    expect(
      cycleDetail(
        { status: "running", since: at(0), watts: 1980, kwh: 0.62 },
        1980,
        at(42),
        "fr",
      ),
    ).toBe("Depuis 42 min · 1 980 W · 0,6 kWh");
    expect(
      cycleDetail(
        { status: "finished", startedAt: at(0), endedAt: at(95), kwh: 2.1 },
        0,
        at(107),
        "fr",
      ),
    ).toBe("Il y a 12\u00a0min · cycle de 1 h 35 · 2,1 kWh");
    expect(cycleDetail({ status: "idle" }, 0, at(0), "en")).toBe("Idle");
  });

  it("formats a running clock", () => {
    expect(formatElapsed(42 * minute + 8000)).toBe("42:08");
    expect(formatElapsed(62 * minute + 8000)).toBe("1:02:08");
  });
});

const appliance = (entityId: string): CycleAppliance => ({
  entityId,
  name: entityId,
  areaId: "cellar",
  areaName: "Cellar",
  plug: {
    id: entityId,
    name: entityId,
    watts: 1980,
    powerId: `sensor.${entityId}`,
    energyId: null,
  },
  tracker: null,
});

describe("buildCycleChips", () => {
  const appliances = ["washer", "dryer", "dishwasher", "oven"].map(appliance);
  const cycles = {
    washer: { status: "running", since: at(0), watts: 1980, kwh: 0.6 },
    dryer: { status: "finished", startedAt: at(-95), endedAt: at(-12), kwh: 2.1 },
    dishwasher: { status: "finished", startedAt: at(-200), endedAt: at(-60), kwh: 1 },
    oven: { status: "idle" },
  } as const;

  it("lists running appliances first, then finished ones by most recent end", () => {
    const chips = buildCycleChips(appliances, cycles, {}, at(42), "fr");
    expect(chips.map((chip) => [chip.entityId, chip.status])).toEqual([
      ["washer", "running"],
      ["dryer", "finished"],
      ["dishwasher", "finished"],
    ]);
    expect(chips[1]).toMatchObject({
      ago: "Il y a 54\u00a0min",
      duration: "1 h 23",
      kwh: "2,1 kWh",
    });
  });

  it("hides a dismissed cycle until the appliance runs again", () => {
    const dismissed = { dryer: at(-12) };
    expect(
      buildCycleChips(appliances, cycles, dismissed, at(42), "en").map(
        (chip) => chip.entityId,
      ),
    ).toEqual(["washer", "dishwasher"]);
    const next = {
      ...cycles,
      dryer: { status: "finished", startedAt: at(10), endedAt: at(30), kwh: 1 },
    } as const;
    expect(
      buildCycleChips(appliances, next, dismissed, at(42), "en").map(
        (chip) => chip.entityId,
      ),
    ).toContain("dryer");
  });
});

describe("parseCycleDismissals", () => {
  it("keeps valid timestamps and drops the rest", () => {
    expect(
      parseCycleDismissals({
        dismissed: {
          "switch.washer": "2026-11-08T10:15:00+00:00",
          "switch.dryer": "yesterday",
          "switch.oven": 3,
        },
      }),
    ).toEqual({ "switch.washer": Date.UTC(2026, 10, 8, 10, 15) });
    expect(parseCycleDismissals(null)).toEqual({});
  });
});

describe("cycle trackers", () => {
  const hour = 3_600_000;
  const start = Date.parse("2026-11-08T18:31:00Z");
  const at = (offset: number) => (start + offset) / 1000;
  const samples = [
    { at: start, watts: 2000 },
    { at: start + hour, watts: 0 },
  ];
  it("keeps a cycle running through quiet phases until the tracker settles", () => {
    const points = [
      { s: "off", lu: at(-hour) },
      { s: "starting", lu: at(0) },
      { s: "running", lu: at(60_000) },
      { s: "paused", lu: at(2 * hour) },
    ];
    expect(trackedCycle(points, samples, start + 3 * hour)).toEqual({
      status: "running",
      since: start,
      watts: 0,
      kwh: 2,
    });
  });
  it("ends the cycle when the tracker leaves its running states", () => {
    const points = [
      { s: "starting", lu: at(0) },
      { s: "ending", lu: at(3 * hour) },
      { s: "unavailable", lu: at(3.1 * hour) },
      { s: "finished", lu: at(3.5 * hour) },
      { s: "off", lu: at(4 * hour) },
    ];
    expect(trackedCycle(points, samples, start + 4 * hour)).toEqual({
      status: "finished",
      startedAt: start,
      endedAt: start + 3.5 * hour,
      kwh: 2,
    });
    expect(trackedCycle(points, samples, start + 10 * hour)).toEqual({
      status: "idle",
    });
  });
  it("finds the WashData device of an appliance by room, then by name", () => {
    const hass = {
      states: Object.fromEntries(
        ["sensor.washer_state", "sensor.dryer_state"].map((id) => [
          id,
          { entity_id: id, state: "off", attributes: {} },
        ]),
      ),
      entities: {
        "sensor.washer_state": {
          entity_id: "sensor.washer_state",
          device_id: "washer",
          platform: "ha_washdata",
          translation_key: "washer_state",
        },
        "sensor.washer_left": {
          entity_id: "sensor.washer_left",
          device_id: "washer",
          platform: "ha_washdata",
          translation_key: "time_remaining",
        },
        "sensor.dryer_state": {
          entity_id: "sensor.dryer_state",
          device_id: "dryer",
          platform: "ha_washdata",
          translation_key: "washer_state",
        },
      },
      devices: {
        washer: { id: "washer", area_id: "laundry", name: "Washer", name_by_user: null },
        dryer: { id: "dryer", area_id: "laundry", name: "Dryer", name_by_user: null },
      },
    } as unknown as HassLike;
    expect(cycleTracker(hass, "laundry", ["Washer plug"])).toEqual({
      stateId: "sensor.washer_state",
      programId: null,
      remainingId: "sensor.washer_left",
      progressId: null,
    });
    expect(cycleTracker(hass, "laundry", ["Kettle"])).toBeNull();
    expect(cycleTracker(hass, "kitchen", ["Washer"])).toBeNull();
    hass.devices.dryer.area_id = "cellar";
    expect(cycleTracker(hass, "laundry", ["Kettle"])?.stateId).toBe(
      "sensor.washer_state",
    );
  });
});
