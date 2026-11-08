import { describe, expect, it } from "vitest";
import { lastStateChange } from "./sensor-history";

const at = (time: string) => Date.parse(`2026-11-08T${time}:00Z`) / 1000;
const restartedAt = "2026-11-08T20:50:00.000Z";

describe("lastStateChange", () => {
  it("reads through a restart that reset last_changed", () => {
    const points = [
      { s: "off", lu: at("00:00") },
      { s: "on", lu: at("10:30") },
      { s: "off", lu: at("12:36") },
      { s: "off", lu: at("20:50") },
    ];
    expect(
      lastStateChange(points, { state: "off", last_changed: restartedAt }),
    ).toBe(at("12:36") * 1000);
  });
  it("reads through an unavailable spell that returns to the same state", () => {
    const points = [
      { s: "on", lu: at("08:00") },
      { s: "off", lu: at("09:00") },
      { s: "unavailable", lu: at("20:49") },
      { s: "off", lu: at("20:50") },
    ];
    expect(
      lastStateChange(points, { state: "off", last_changed: restartedAt }),
    ).toBe(at("09:00") * 1000);
  });
  it("is null when the state held for the whole history", () => {
    const points = [
      { s: "off", lu: at("00:00") },
      { s: "off", lu: at("20:50") },
    ];
    expect(
      lastStateChange(points, { state: "off", last_changed: restartedAt }),
    ).toBeNull();
  });
  it("trusts last_changed for a change the history doesn't have yet", () => {
    const points = [{ s: "off", lu: at("00:00") }];
    expect(
      lastStateChange(points, { state: "on", last_changed: restartedAt }),
    ).toBe(Date.parse(restartedAt));
  });
});
