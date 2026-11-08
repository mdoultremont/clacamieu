import { describe, expect, it } from "vitest";
import { buildPlugPowerView } from "./plug-power-view";

const plug = (id: string, watts: number | null, energyId: string | null = `sensor.${id}`) => ({
  id,
  name: id,
  watts,
  powerId: `sensor.${id}_power`,
  energyId,
});

describe("buildPlugPowerView", () => {
  it("lists running plugs by draw, then idle plugs by energy used today", () => {
    const view = buildPlugPowerView(
      [plug("box", 24), plug("washer", 0.4), plug("oven", 1054), plug("lamp", 0)],
      { "sensor.box": 0.6, "sensor.washer": 0.9, "sensor.oven": 1.24, "sensor.lamp": 0 },
      "fr",
    );
    expect(view.watts).toBe("1\u202f078 W");
    expect(view.today).toBe("2,7 kWh");
    expect(view.running).toBe(2);
    expect(view.rows).toEqual([
      { name: "oven", running: true, watts: "1\u202f054 W", today: "1,2 kWh", share: expect.closeTo(1.24 / 2.74) },
      { name: "box", running: true, watts: "24 W", today: "600 Wh", share: expect.closeTo(0.6 / 2.74) },
      { name: "washer", running: false, watts: null, today: "900 Wh", share: expect.closeTo(0.9 / 2.74) },
    ]);
    expect(view.others).toBeNull();
  });

  it("folds plugs past the third into one summary row", () => {
    const view = buildPlugPowerView(
      [plug("a", 400), plug("b", 300), plug("c", 200), plug("d", 5), plug("e", 0)],
      { "sensor.a": 1, "sensor.b": 1, "sensor.c": 1, "sensor.d": 0.1, "sensor.e": 0.3 },
      "en",
    );
    expect(view.rows.map((row) => row.name)).toEqual(["a", "b", "c"]);
    expect(view.others).toEqual({
      count: 2,
      running: true,
      watts: "5 W",
      today: "400 Wh",
      share: expect.closeTo(0.4 / 3.4),
    });
  });

  it("shows power alone while today's energy loads or without energy sensors", () => {
    const loading = buildPlugPowerView([plug("a", 50), plug("b", 0)], null, "en");
    expect(loading.today).toBeNull();
    expect(loading.tracksEnergy).toBe(true);
    expect(loading.rows).toEqual([
      { name: "a", running: true, watts: "50 W", today: null, share: null },
    ]);
    const untracked = buildPlugPowerView([plug("a", 50, null)], {}, "en");
    expect(untracked.tracksEnergy).toBe(false);
  });

  it("reports no total when no plug has a reading", () => {
    expect(buildPlugPowerView([plug("a", null)], null, "en").watts).toBeNull();
  });
});
