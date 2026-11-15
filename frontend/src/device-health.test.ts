import { describe, expect, it } from "vitest";
import { areaHealth, buildDeviceHealth } from "./device-health";
import type { HassEntity, HassLike } from "./types";

function fixture() {
  const hass = {
    language: "en",
    states: {},
    entities: {},
    areas: {
      office: { area_id: "office", name: "Office", icon: null },
      kitchen: { area_id: "kitchen", name: "Kitchen", icon: null },
    },
    devices: {},
  } as unknown as HassLike;
  const add = (
    id: string,
    state: string,
    device: { id: string; area: string },
    attributes: HassEntity["attributes"] = {},
  ) => {
    hass.states[id] = {
      entity_id: id,
      state,
      attributes,
      last_changed: "2026-10-21T11:00:00Z",
      last_updated: "",
      context: { id: "t", parent_id: null, user_id: null },
    };
    hass.entities[id] = { entity_id: id, device_id: device.id };
    hass.devices[device.id] = {
      id: device.id,
      area_id: device.area,
      name: device.id,
      name_by_user: null,
    };
  };
  const battery = (id: string, level: string, area: string) =>
    add(id, level, { id, area }, {
      device_class: "battery",
      unit_of_measurement: "%",
    });
  return { hass, add, battery };
}

describe("device health per area", () => {
  it("counts each offline device once in its area, ignoring partly responding devices", () => {
    const { hass, add } = fixture();
    const motion = { id: "motion", area: "office" };
    add("binary_sensor.motion", "unavailable", motion);
    add("sensor.motion_lux", "unavailable", motion);
    add("switch.plug", "unavailable", { id: "plug", area: "office" });
    const lamp = { id: "lamp", area: "office" };
    add("light.lamp", "on", lamp);
    add("select.lamp_effect", "unavailable", lamp);
    add("switch.kettle", "unavailable", { id: "kettle", area: "kitchen" });
    const health = buildDeviceHealth(hass);
    expect(areaHealth(health, "office").offline).toBe(2);
    expect(areaHealth(health, "kitchen").offline).toBe(1);
  });
  it("reports the lowest battery only when it is below 20 %", () => {
    const { hass, battery } = fixture();
    battery("sensor.door_battery", "15", "office");
    battery("sensor.remote_battery", "9", "office");
    battery("sensor.thermostat_battery", "20", "kitchen");
    battery("sensor.window_battery", "unavailable", "kitchen");
    const health = buildDeviceHealth(hass);
    expect(areaHealth(health, "office").lowestBattery).toBe(9);
    expect(areaHealth(health, "kitchen").lowestBattery).toBeNull();
  });
});
