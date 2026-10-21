import { resolveDashboardConfig } from "./home-view";
import type { DashboardConfig, HassLike, HomeCard, RoomConfig } from "./types";

export interface ConfigEditorState {
  config: DashboardConfig;
  automatic: { home_cards: HomeCard[]; rooms: RoomConfig[] };
}

export type ConfigEditorAction =
  | { type: "reset" }
  | { type: "materialize" }
  | { type: "reorder"; list: "home_cards" | "rooms"; from: number; to: number }
  | { type: "toggle-card"; id: string }
  | { type: "toggle-room"; areaId: string }
  | { type: "add-card"; card: HomeCard }
  | { type: "remove-card"; id: string }
  | { type: "entity-add"; id: string; entityId: string }
  | { type: "entity-remove"; id: string; index: number }
  | { type: "entity-reorder"; id: string; from: number; to: number }
  | { type: "edit-card"; card: HomeCard }
  | { type: "edit-room"; room: RoomConfig };

export function createConfigEditor(
  config: DashboardConfig,
  hass: HassLike,
): ConfigEditorState {
  const automatic = resolveDashboardConfig(hass, {
    home_cards: null,
    rooms: null,
  });
  const rooms =
    config.rooms?.filter((room) => !!hass.areas[room.area_id]) ?? null;
  return configEditorReducer(
    { config: { ...config, rooms }, automatic },
    { type: "materialize" },
  );
}

export function editorLists(state: ConfigEditorState) {
  const saved = state.config.rooms;
  const rooms =
    saved === null
      ? state.automatic.rooms
      : [
          ...saved,
          ...state.automatic.rooms
            .filter(
              (area) => !saved.some((room) => room.area_id === area.area_id),
            )
            .map((room) => ({ ...room, hidden: true })),
        ];
  return {
    home_cards: state.config.home_cards ?? state.automatic.home_cards,
    rooms,
  };
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length ||
    from === to
  )
    return items;
  const next = [...items];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

export function configEditorReducer(
  state: ConfigEditorState,
  action: ConfigEditorAction,
): ConfigEditorState {
  if (action.type === "reset")
    return { ...state, config: { home_cards: null, rooms: null } };
  const lists = editorLists(state);
  let { home_cards: cards, rooms } = lists;
  switch (action.type) {
    case "materialize":
      break;
    case "reorder":
      if (action.list === "home_cards")
        cards = moveItem(cards, action.from, action.to);
      else rooms = moveItem(rooms, action.from, action.to);
      break;
    case "toggle-card":
      cards = cards.map((card) =>
        card.id === action.id ? { ...card, hidden: !card.hidden } : card,
      );
      break;
    case "toggle-room":
      rooms = rooms.map((room) =>
        room.area_id === action.areaId
          ? { ...room, hidden: !room.hidden }
          : room,
      );
      break;
    case "add-card":
      if (
        cards.length < 100 &&
        !cards.some((card) => card.id === action.card.id)
      )
        cards = [...cards, action.card];
      break;
    case "remove-card":
      cards = cards.filter((card) => card.id !== action.id);
      break;
    case "entity-add":
    case "entity-remove":
    case "entity-reorder":
      cards = cards.map((card) => {
        if (card.id !== action.id || card.type !== "entities") return card;
        const ids = card.entity_ids;
        const entity_ids =
          action.type === "entity-add"
            ? ids.length < 500 && !ids.includes(action.entityId)
              ? [...ids, action.entityId]
              : ids
            : action.type === "entity-remove"
              ? ids.filter((_, index) => index !== action.index)
              : moveItem(ids, action.from, action.to);
        return { ...card, entity_ids };
      });
      break;
    case "edit-card":
      cards = cards.map((card) =>
        card.id === action.card.id ? action.card : card,
      );
      break;
    case "edit-room":
      rooms = rooms.map((room) =>
        room.area_id === action.room.area_id ? action.room : room,
      );
      break;
  }
  return { ...state, config: { home_cards: cards, rooms } };
}

export function defaultCard(
  type: HomeCard["type"],
  id: string,
  hass: HassLike,
  title: string,
): HomeCard | null {
  switch (type) {
    case "alarm":
    case "vacuum": {
      const domain = type === "alarm" ? "alarm_control_panel" : "vacuum";
      const entity = Object.keys(hass.states).find((entityId) =>
        entityId.startsWith(`${domain}.`),
      );
      return entity ? { id, type, entity_id: entity } : null;
    }
    case "entities":
      return { id, type, title, entity_ids: [] };
    default:
      return { id, type };
  }
}
