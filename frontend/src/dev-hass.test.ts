import { describe, expect, it, vi } from "vitest";
import {
  developmentDashboardCalls,
  decodeEntities,
  DevelopmentWriteBlocked,
  readOnlyCalls,
} from "./dev-hass";

describe("development transport", () => {
  it("never forwards a service call", async () => {
    const send = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      readOnlyCalls(send).callService(
        "vacuum",
        "start",
        {},
        { entity_id: "vacuum.helper" },
      ),
    ).rejects.toBeInstanceOf(DevelopmentWriteBlocked);
    expect(send).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "Blocked service call in development: vacuum.start",
    );
    warn.mockRestore();
  });
  it.each([
    "frontend/set_user_data",
    "call_service",
    "config/area_registry/update",
    "unknown/read",
  ])("blocks %s before transport", async (type) => {
    const send = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(readOnlyCalls(send).callWS({ type })).rejects.toBeInstanceOf(
      DevelopmentWriteBlocked,
    );
    expect(send).not.toHaveBeenCalled();
    warn.mockRestore();
  });
  it.each([
    "config/area_registry/list",
    "config/device_registry/list",
    "config/entity_registry/list_for_display",
    "get_panels",
    "auth/current_user",
    "get_config",
    "clacamieu/dashboard/config",
    "frontend/get_user_data",
  ])("forwards the allowlisted read %s", async (type) => {
    const send = vi.fn().mockResolvedValue({ value: true });
    await expect(readOnlyCalls(send).callWS({ type })).resolves.toEqual({
      value: true,
    });
    expect(send).toHaveBeenCalledExactlyOnceWith({ type });
  });
  it("decodes display registry keys including category zero", () => {
    expect(
      decodeEntities({
        entity_categories: { 0: "config" },
        entities: [
          {
            ei: "sensor.example",
            ai: "area_a",
            di: "device_a",
            hb: true,
            ec: 0,
            en: "Example",
          },
        ],
      }),
    ).toEqual({
      "sensor.example": {
        entity_id: "sensor.example",
        area_id: "area_a",
        device_id: "device_a",
        hidden: true,
        entity_category: "config",
        name: "Example",
      },
    });
  });
});

it("keeps dashboard reads and updates in memory without forwarding them", async () => {
  const send = vi.fn().mockResolvedValue({ value: true });
  const calls = developmentDashboardCalls(readOnlyCalls(send), {
    home_cards: [{ id: "s", type: "summary" }],
    rooms: null,
  });
  expect(await calls.callWS({ type: "clacamieu/dashboard/config" })).toEqual({
    home_cards: [{ id: "s", type: "summary" }],
    rooms: null,
  });
  const update = {
    type: "clacamieu/dashboard/config/update",
    home_cards: [],
    rooms: [{ area_id: "room_a" }],
  };
  const result = await calls.callWS<{ rooms: { area_id: string }[] }>(update);
  result.rooms[0].area_id = "mutated";
  update.rooms[0].area_id = "also_mutated";
  expect(await calls.callWS({ type: "clacamieu/dashboard/config" })).toEqual({
    home_cards: [],
    rooms: [{ area_id: "room_a" }],
  });
  expect(send).not.toHaveBeenCalled();
  await calls.callWS({ type: "get_config" });
  expect(send).toHaveBeenCalledExactlyOnceWith({ type: "get_config" });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await expect(
    calls.callWS({ type: "frontend/set_user_data" }),
  ).rejects.toBeInstanceOf(DevelopmentWriteBlocked);
  await expect(
    calls.callService("homeassistant", "toggle"),
  ).rejects.toBeInstanceOf(DevelopmentWriteBlocked);
  expect(send).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});
