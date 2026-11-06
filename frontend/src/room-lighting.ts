import { numeric } from "./home-view";
import { entityArea } from "./room-sensors";
import type {
  HassEntity,
  HassLike,
  LightingCommand,
  ServiceAction,
} from "./types";
import type { ServiceCatalog } from "./vacuum-view";

export interface RoomLighting {
  entityId: string;
  on: boolean;
  available: boolean;
  brightness: number | null;
  dimmable: boolean;
  toggle: ServiceAction;
  scenes: { id: string; name: string; action: ServiceAction }[];
}


// A room lighting controller is a script that accepts a `command` field, like
// scripts created from a room lighting blueprint.
export function lightingControllers(services: ServiceCatalog): Set<string> {
  return new Set(
    Object.entries(services.script ?? {})
      .filter(([, service]) => {
        const fields = (service as { fields?: unknown } | null)?.fields;
        return !!fields && typeof fields === "object" && "command" in fields;
      })
      .map(([id]) => `script.${id}`),
  );
}

export function airLevel(co2: number | null): "good" | "fair" | "poor" | null {
  if (co2 === null) return null;
  return co2 < 800 ? "good" : co2 < 1200 ? "fair" : "poor";
}

export function buildRoomLighting(
  hass: HassLike,
  areaId: string,
  controllers: ReadonlySet<string>,
): RoomLighting | null {
  const inArea = Object.values(hass.states).filter(
    (entity) =>
      !hass.entities[entity.entity_id]?.hidden &&
      !hass.entities[entity.entity_id]?.entity_category &&
      entityArea(hass, entity.entity_id) === areaId,
  );
  const lights = inArea.filter((entity) =>
    entity.entity_id.startsWith("light."),
  );
  const main =
    lights.find((entity) => Array.isArray(entity.attributes.entity_id)) ??
    (lights.length === 1 ? lights[0] : undefined);
  if (!main) return null;
  const controller = inArea.find((entity) => controllers.has(entity.entity_id));
  const name = (entity: HassEntity) =>
    entity.attributes.friendly_name ??
    hass.entities[entity.entity_id]?.name ??
    entity.entity_id;
  const command = (
    variables: LightingCommand,
    label: string,
  ): ServiceAction | null =>
    controller
      ? {
          domain: "script",
          service: "turn_on",
          entityId: controller.entity_id,
          label,
          data: { variables },
        }
      : null;
  const brightness = numeric(main.attributes.brightness);
  return {
    entityId: main.entity_id,
    on: main.state === "on",
    available: !["unavailable", "unknown"].includes(main.state),
    brightness:
      main.state === "on" && brightness !== null
        ? Math.round((Math.min(255, Math.max(0, brightness)) / 255) * 100)
        : null,
    dimmable:
      Array.isArray(main.attributes.supported_color_modes) &&
      main.attributes.supported_color_modes.some(
        (mode: string) => mode !== "onoff",
      ),
    toggle: command({ command: "toggle" }, name(main)) ?? {
      domain: "light",
      service: "toggle",
      entityId: main.entity_id,
      label: name(main),
    },
    scenes: inArea
      .filter((entity) => entity.entity_id.startsWith("scene."))
      .map((scene) => ({
        id: scene.entity_id,
        name: name(scene),
        action: command(
          { command: "set_scene", scene: scene.entity_id },
          name(scene),
        ) ?? {
          domain: "scene",
          service: "turn_on",
          entityId: scene.entity_id,
          label: name(scene),
        },
      })),
  };
}
