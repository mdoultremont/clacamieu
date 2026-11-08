import type { Connection, HassEntity } from "home-assistant-js-websocket";
import type { RoomCard } from "./room-card";
import type { CycleAppliance } from "./cycle-view";
import type { EntityDisplay } from "./room-display";
export type { HassEntity } from "home-assistant-js-websocket";

export interface EntityDisplayEntry {
  entity_id: string;
  device_id?: string | null;
  area_id?: string | null;
  hidden?: boolean;
  entity_category?: string | null;
  name?: string | null;
  /** The integration that provides the entity. */
  platform?: string;
  translation_key?: string | null;
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
  floor_id?: string | null;
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
  floors?: Record<string, { floor_id: string; name: string }>;
  connection?: Pick<Connection, "subscribeMessage">;
  panels: Record<string, PanelEntry>;
  user: { id: string; name: string; is_admin: boolean };
  language: string;
  themes?: { darkMode?: boolean };
  hassUrl?(path: string): string;
  config?: { time_zone?: string };
  formatEntityState?: (state: HassEntity, value?: string) => string;
  callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: { entity_id: string | string[] },
  ): Promise<unknown>;
  callWS<T>(message: { type: string } & Record<string, unknown>): Promise<T>;
}

export type HomeCard = { hidden?: boolean } & (
  | { id: string; type: "power" }
  | { id: string; type: "rooms"; area_ids?: string[] }
  | { id: string; type: "alarm" | "vacuum"; entity_id: string }
  | { id: string; type: "entities"; title: string; entity_ids: string[] }
);

export interface RoomConfig {
  hidden?: boolean;
  area_id: string;
  temperature_entity_id?: string | null;
  humidity_entity_id?: string | null;
  co2_entity_id?: string | null;
  /** The room page's elements in order, with how each one shows. */
  entities?: RoomEntityConfig[];
}

export interface RoomEntityConfig {
  entity_id: string;
  display: EntityDisplay;
  /** The element's name in Maison, in place of its Home Assistant name. */
  name?: string;
}

export interface SecurityConfig {
  /** Sensors left out of Security, such as spares that are not installed. */
  hidden_entity_ids: string[];
}

export interface VacuumConfig {
  /** The vacuum page's sections in order; missing ones follow in default order. */
  sections: VacuumSection[];
}

export const vacuumSections = [
  "shortcuts",
  "rooms",
  "maintenance",
  "station",
  "statistics",
] as const;
export type VacuumSection = (typeof vacuumSections)[number];

export interface DashboardConfig {
  home_cards: HomeCard[] | null;
  rooms: RoomConfig[] | null;
  security?: SecurityConfig | null;
  vacuum?: VacuumConfig | null;
}

export interface PanelInfo {
  url_path: string;
  title?: string;
  config?: Record<string, unknown>;
}

export type LightingCommand =
  | { command: "toggle" }
  | { command: "set_scene"; scene: string };

export type ServiceAction = {
  entityId: string;
  label: string;
} & (
  | {
      domain: "alarm_control_panel";
      service: "alarm_arm_away" | "alarm_disarm";
    }
  | {
      domain: "vacuum";
      service: "start" | "pause" | "return_to_base" | "locate";
    }
  | {
      domain: "dreame_vacuum";
      service: "vacuum_clean_segment";
      data: { segments: number[] };
    }
  | { domain: "button"; service: "press" }
  | {
      domain: "select";
      service: "select_option";
      data: { option: string };
    }
  | { domain: "homeassistant"; service: "toggle" }
  | { domain: "light"; service: "toggle" }
  | { domain: "light"; service: "turn_on"; data: { brightness_pct: number } }
  | { domain: "scene"; service: "turn_on" }
  | {
      domain: "script";
      service: "turn_on";
      data: { variables: LightingCommand };
    }
  | { domain: "cover"; service: "open_cover" | "close_cover" }
  | { domain: "valve"; service: "open_valve" | "close_valve" }
  | { domain: "switch"; service: "turn_on" | "turn_off" }
);

export type Tone = "idle" | "active" | "alert";

export interface HomeData {
  date: string;
  weather: {
    temperature: string | null;
    condition: string;
    state: string;
  } | null;
  rooms: RoomCard[];
  lightsOn: number;
  alarm: {
    title: string;
    status: string;
    tone: Tone;
    safety: { text: string; alert: boolean }[];
    action: ServiceAction | null;
  } | null;
  vacuum: {
    name: string;
    state: string;
    tone: Tone;
    battery: string | null;
    action: ServiceAction | null;
  } | null;
  plugPower: { plugs: PlugReading[] } | null;
}

export interface PlugReading {
  /** Device id. */
  id: string;
  name: string;
  /** Current draw, or null without a reading. */
  watts: number | null;
  /** The power sensor whose history shows the plug's cycles. */
  powerId: string;
  /** Energy sensor whose statistics give today's consumption. */
  energyId: string | null;
}

export type HomeCardView = { id: string } & (
  | ({ type: "rooms" } & Pick<HomeData, "rooms" | "lightsOn"> & {
      areaIds: string[] | null;
    })
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
  date: string;
  weather: HomeData["weather"];
  cards: HomeCardView[];
  cycleAppliances: CycleAppliance[];
}
