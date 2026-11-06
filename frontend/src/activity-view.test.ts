import { describe, expect, it } from "vitest";
import { activityEntityIds, buildActivity } from "./activity-view";
import { securityFixture } from "./security-view.test";

const now = new Date("2026-10-21T18:00:00Z");
const at = (iso: string) => Date.parse(iso) / 1000;

describe("security activity", () => {
  it("follows visible openings, alert and motion sensors, and the alarm", () => {
    const hass = securityFixture();
    hass.states["binary_sensor.hall_motion"] = {
      ...hass.states["binary_sensor.door"],
      entity_id: "binary_sensor.hall_motion",
      attributes: { device_class: "motion", friendly_name: "Hall motion" },
    };
    const ids = activityEntityIds(hass);
    expect(ids).toEqual(
      expect.arrayContaining([
        "alarm_control_panel.example",
        "binary_sensor.door",
        "binary_sensor.leak",
        "binary_sensor.hall_motion",
      ]),
    );
    expect(ids.some((id) => id.startsWith("camera."))).toBe(false);
  });
  it("groups the newest changes by day with labels and tones", () => {
    const hass = securityFixture();
    const days = buildActivity(
      hass,
      [
        { entity_id: "binary_sensor.door", state: "off", when: at("2026-10-20T20:00:00Z") },
        { entity_id: "binary_sensor.door", state: "on", when: at("2026-10-21T17:30:00Z") },
        { entity_id: "binary_sensor.leak", state: "on", when: at("2026-10-21T17:45:00Z") },
        { entity_id: "alarm_control_panel.example", state: "armed_away", when: at("2026-10-21T17:00:00Z") },
        { entity_id: "binary_sensor.door", state: "unavailable", when: at("2026-10-21T17:50:00Z") },
        { entity_id: "sensor.removed", state: "on", when: at("2026-10-21T17:55:00Z") },
      ],
      now,
    );
    expect(days.map((day) => day.label)).toEqual([
      "Aujourd'hui · 21 octobre",
      "Hier · 20 octobre",
    ]);
    expect(days[0].events).toMatchObject([
      { entityId: "binary_sensor.leak", state: "Fuite", tone: "alert" },
      { entityId: "binary_sensor.door", state: "Ouvert", tone: "active", name: "Door" },
      { entityId: "alarm_control_panel.example", state: "Absent", tone: "active" },
    ]);
    expect(days[1].events).toMatchObject([
      { entityId: "binary_sensor.door", state: "Fermé", tone: "idle" },
    ]);
  });
});
