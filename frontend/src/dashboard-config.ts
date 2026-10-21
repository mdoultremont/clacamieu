import type { DashboardConfig, HomeCard, RoomConfig } from "./types";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const entityId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9_]+\.[a-z0-9_]+$/.test(value);

function parseCard(value: unknown): HomeCard | null {
  if (!record(value) || typeof value.id !== "string" || !value.id) return null;
  if (value.hidden !== undefined && typeof value.hidden !== "boolean")
    return null;
  const hidden = value.hidden === undefined ? {} : { hidden: value.hidden };
  const { id, type } = value;
  switch (type) {
    case "summary":
    case "presence":
    case "rooms":
    case "power":
      return { id, type, ...hidden };
    case "alarm":
    case "vacuum":
      return entityId(value.entity_id) &&
        value.entity_id.startsWith(
          type === "alarm" ? "alarm_control_panel." : "vacuum.",
        )
        ? { id, type, ...hidden, entity_id: value.entity_id }
        : null;
    case "entities":
      return typeof value.title === "string" &&
        Array.isArray(value.entity_ids) &&
        value.entity_ids.every(entityId)
        ? {
            id,
            type,
            ...hidden,
            title: value.title,
            entity_ids: [...value.entity_ids],
          }
        : null;
    default:
      return null;
  }
}

function parseRoom(value: unknown): RoomConfig | null {
  if (!record(value) || typeof value.area_id !== "string" || !value.area_id)
    return null;
  if (value.hidden !== undefined && typeof value.hidden !== "boolean")
    return null;
  const room: RoomConfig = { area_id: value.area_id };
  if (value.hidden !== undefined) room.hidden = value.hidden;
  for (const key of [
    "temperature_entity_id",
    "humidity_entity_id",
    "co2_entity_id",
  ] as const) {
    const override = value[key];
    if (override === undefined) continue;
    if (override !== null && !entityId(override)) return null;
    room[key] = override;
  }
  return room;
}

function parseList<T>(
  value: unknown,
  parse: (item: unknown) => T | null,
  key: (item: T) => string,
): T[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  return value.flatMap((entry) => {
    const item = parse(entry);
    if (!item || seen.has(key(item))) return [];
    seen.add(key(item));
    return [item];
  });
}

export function parseDashboardConfig(value: unknown): DashboardConfig {
  if (!record(value)) return { home_cards: null, rooms: null };
  return {
    home_cards: parseList(value.home_cards, parseCard, (card) => card.id),
    rooms: parseList(value.rooms, parseRoom, (room) => room.area_id),
  };
}
