import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Room } from "./components/room";
import { PortalContainerContext } from "./portal-container";
import { buildRoomView } from "./room-view";
import type {
  DashboardConfig,
  HassEntity,
  HassLike,
  RoomEntityConfig,
} from "./types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;
let portal: HTMLDivElement;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  portal?.remove();
});

function fixture(): HassLike {
  const states: HassLike["states"] = {};
  const entities: HassLike["entities"] = {};
  const add = (
    id: string,
    state: string,
    attributes: HassEntity["attributes"],
    device: string,
  ) => {
    states[id] = {
      entity_id: id,
      state,
      attributes,
      last_changed: "",
      last_updated: "",
      context: { id: "test", parent_id: null, user_id: null },
    };
    entities[id] = { entity_id: id, device_id: device };
  };
  add("light.lamp", "on", { friendly_name: "Lamp" }, "lamp");
  add("switch.oven", "on", { friendly_name: "Oven" }, "oven");
  add(
    "sensor.oven_power",
    "1250",
    { device_class: "power", unit_of_measurement: "W" },
    "oven",
  );
  add(
    "sensor.oven_energy",
    "12.5",
    { device_class: "energy", state_class: "total_increasing" },
    "oven",
  );
  add("switch.kettle", "off", { friendly_name: "Kettle" }, "kettle");
  add("switch.toaster", "off", { friendly_name: "Toaster" }, "toaster");
  add(
    "binary_sensor.window",
    "off",
    { friendly_name: "Window", device_class: "window" },
    "window",
  );
  return {
    states,
    entities,
    devices: Object.fromEntries(
      ["lamp", "oven", "kettle", "toaster", "window"].map((id) => [
        id,
        { id, area_id: "kitchen", name: id, name_by_user: null },
      ]),
    ),
    areas: { kitchen: { area_id: "kitchen", name: "Kitchen", icon: null } },
    panels: {},
    language: "en",
    user: { id: "admin", name: "Example", is_admin: true },
    callWS: vi.fn(async () => ({
      "sensor.oven_energy": [{ change: 0.2 }, { change: 0.25 }],
    })) as HassLike["callWS"],
    callService: vi.fn(),
  };
}

const config: DashboardConfig = {
  home_cards: null,
  rooms: [
    {
      area_id: "kitchen",
      entities: [
        { entity_id: "switch.oven", display: "power" },
        { entity_id: "switch.toaster", display: "hidden" },
        { entity_id: "switch.kettle", display: "control" },
        { entity_id: "binary_sensor.window", display: "hidden" },
      ],
    },
  ],
};

async function mount(
  onCustomize?: (entities: RoomEntityConfig[]) => Promise<void>,
) {
  const hass = fixture();
  container = document.createElement("div");
  portal = document.createElement("div");
  document.body.append(container, portal);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <PortalContainerContext value={portal}>
        <Room
          view={buildRoomView(hass, config, "kitchen")!}
          hass={hass}
          now={new Date()}
          lighting={null}
          language="en"
          onMoreInfo={vi.fn()}
          busy={false}
          onAction={vi.fn()}
          error={null}
          onCustomize={onCustomize}
        />
      </PortalContainerContext>,
    ),
  );
}
const switches = () =>
  Array.from(container.querySelectorAll('[role="switch"]')).map((element) =>
    element.getAttribute("aria-label"),
  );

describe("room customization", () => {
  it("shows a power reading in place of a toggle and leaves hidden elements out", async () => {
    await mount();
    expect(switches()).toEqual(["Lamp", "Kettle"]);
    expect(container.textContent).toContain("1,250 W");
    expect(container.textContent).toContain("Today · 450 Wh");
    expect(container.textContent).not.toContain("Toaster");
    expect(container.textContent).not.toContain("Window");
    expect(
      container.querySelector('[aria-label="Customize room"]'),
    ).toBeNull();
  });
  it("lets an admin change an element's display and saves every element in order", async () => {
    const onCustomize = vi.fn(async () => {});
    await mount(onCustomize);
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Customize room"]')!
        .click();
    });
    const group = (name: string) =>
      portal.querySelector(`[aria-label="How ${name} shows"]`)!;
    expect(
      Array.from(group("Kettle").querySelectorAll("button")).map(
        (button) => button.textContent,
      ),
    ).toEqual(["Control", "Hidden"]);
    expect(
      Array.from(group("Oven").querySelectorAll("button")).map(
        (button) => button.textContent,
      ),
    ).toEqual(["Control", "Power", "Cycle", "Hidden"]);
    await act(async () => {
      Array.from(group("Kettle").querySelectorAll("button"))
        .find((button) => button.textContent === "Hidden")!
        .click();
    });
    await act(async () => {
      Array.from(portal.querySelectorAll("button"))
        .find((button) => button.textContent === "Done")!
        .click();
    });
    expect(onCustomize).toHaveBeenCalledWith([
      { entity_id: "light.lamp", display: "control" },
      { entity_id: "switch.oven", display: "power" },
      { entity_id: "switch.toaster", display: "hidden" },
      { entity_id: "switch.kettle", display: "hidden" },
      { entity_id: "binary_sensor.window", display: "hidden" },
    ]);
  });
});
