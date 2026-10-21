import type { HassEntity } from "home-assistant-js-websocket";
export type { HassEntity } from "home-assistant-js-websocket";

export interface EntityDisplayEntry {
  entity_id: string;
  device_id?: string | null;
  area_id?: string | null;
  hidden?: boolean;
  entity_category?: string | null;
  name?: string | null;
}

export interface DeviceEntry {
  id: string;
  area_id: string | null;
  name: string | null;
  name_by_user: string | null;
}

export interface AreaEntry {
  area_id: string;
  name: string;
  icon: string | null;
  temperature_entity_id?: string | null;
  humidity_entity_id?: string | null;
}

export interface PanelEntry {
  url_path: string;
  component_name: string;
  title: string | null;
  icon: string | null;
}

export interface HassLike {
  states: Record<string, HassEntity>;
  entities: Record<string, EntityDisplayEntry>;
  devices: Record<string, DeviceEntry>;
  areas: Record<string, AreaEntry>;
  panels: Record<string, PanelEntry>;
  user: { id: string; name: string; is_admin: boolean };
  language: string;
  callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: { entity_id: string | string[] },
  ): Promise<unknown>;
  callWS<T>(message: { type: string } & Record<string, unknown>): Promise<T>;
}

export type HomeCard =
  | { id: string; type: "summary" | "presence" | "rooms" | "power" }
  | { id: string; type: "alarm" | "vacuum"; entity_id: string }
  | { id: string; type: "entities"; title: string; entity_ids: string[] };

export interface RoomConfig {
  area_id: string;
  temperature_entity_id?: string | null;
  humidity_entity_id?: string | null;
  co2_entity_id?: string | null;
}

export interface DashboardConfig {
  home_cards: HomeCard[] | null;
  rooms: RoomConfig[] | null;
}

export interface PanelInfo {
  url_path: string;
  title?: string;
  config?: Record<string, unknown>;
}

export interface ServiceAction {
  domain: "alarm_control_panel" | "vacuum" | "homeassistant";
  service:
    "alarm_arm_away" | "alarm_disarm" | "start" | "return_to_base" | "toggle";
  entityId: string;
  label: string;
}

export interface HomeData {
  greeting: string;
  date: string;
  indoorTemperature: string | null;
  weather: { temperature: string | null; condition: string } | null;
  people: { id: string; name: string; home: boolean; currentUser: boolean }[];
  rooms: {
    id: string;
    name: string;
    temperature: string | null;
    humidity: string | null;
    co2: string | null;
    lightsOn: boolean;
  }[];
  lightsOn: number;
  alarm: {
    title: string;
    subtitle: string;
    tone: "green" | "amber" | "red";
    action: ServiceAction | null;
  } | null;
  vacuum: {
    name: string;
    state: string;
    battery: string | null;
    action: ServiceAction | null;
  } | null;
  plugPower: { total: string; topConsumer: string } | null;
}

export type HomeCardView = { id: string } & (
  | ({ type: "summary" } & Pick<
      HomeData,
      "greeting" | "date" | "indoorTemperature" | "weather"
    >)
  | ({ type: "presence" } & Pick<HomeData, "people">)
  | ({ type: "rooms" } & Pick<HomeData, "rooms" | "lightsOn">)
  | { type: "alarm"; alarm: NonNullable<HomeData["alarm"]> }
  | { type: "vacuum"; vacuum: NonNullable<HomeData["vacuum"]> }
  | { type: "power"; plugPower: NonNullable<HomeData["plugPower"]> }
  | {
      type: "entities";
      title: string;
      entities: {
        id: string;
        name: string;
        state: string;
        on: boolean;
        available: boolean;
        action: ServiceAction | null;
      }[];
    }
);

export interface HomeView {
  cards: HomeCardView[];
}
