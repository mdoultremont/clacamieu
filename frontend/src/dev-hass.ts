import {
  callService,
  createConnection,
  createLongLivedTokenAuth,
  subscribeEntities,
} from "home-assistant-js-websocket";
import { parseCycleDismissals } from "./cycle-view";
import { parseDashboardConfig } from "./dashboard-config";
import type {
  DashboardConfig,
  AreaEntry,
  DeviceEntry,
  EntityDisplayEntry,
  HassLike,
  PanelEntry,
} from "./types";

export class DevelopmentWriteBlocked extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DevelopmentWriteBlocked";
  }
}

const readTypes = new Set([
  "config/area_registry/list",
  "config/floor_registry/list",
  "config/device_registry/list",
  "config/entity_registry/list_for_display",
  "get_panels",
  "auth/current_user",
  "get_config",
  "clacamieu/dashboard/config",
  "clacamieu/dashboard/cycles",
  "frontend/get_user_data",
  "energy/get_prefs",
  "recorder/statistics_during_period",
  "recorder/get_statistics_metadata",
  "logbook/get_events",
  "history/history_during_period",
  "get_services",
  "repairs/list_issues",
]);

export function readOnlyCalls(
  send: HassLike["callWS"],
): Pick<HassLike, "callWS" | "callService"> {
  const block = (message: string): Promise<never> => {
    console.warn(message);
    return Promise.reject(new DevelopmentWriteBlocked(message));
  };
  return {
    callService: (domain, service) =>
      block(`Blocked service call in development: ${domain}.${service}`),
    callWS: <T>(
      message: { type: string } & Record<string, unknown>,
    ): Promise<T> =>
      readTypes.has(message.type)
        ? send<T>(message)
        : block(`Blocked WebSocket call in development: ${message.type}`),
  };
}

const readSubscriptionTypes = new Set(["weather/subscribe_forecast"]);

export function readOnlyConnection(
  connection: NonNullable<HassLike["connection"]>,
): NonNullable<HassLike["connection"]> {
  return {
    subscribeMessage: (callback, message) =>
      readSubscriptionTypes.has(message.type)
        ? connection.subscribeMessage(callback, message)
        : Promise.reject(
            new DevelopmentWriteBlocked(
              `Blocked WebSocket subscription in development: ${message.type}`,
            ),
          ),
  };
}

export function developmentDashboardCalls(
  calls: Pick<HassLike, "callWS" | "callService">,
  seed: DashboardConfig,
  dismissedSeed: Record<string, number> = {},
): Pick<HassLike, "callWS" | "callService"> {
  let config = structuredClone(seed);
  const dismissed = { ...dismissedSeed };
  const cycles = () => ({
    dismissed: Object.fromEntries(
      Object.entries(dismissed).map(([id, at]) => [
        id,
        new Date(at).toISOString(),
      ]),
    ),
  });
  return {
    ...calls,
    callWS: async <T>(
      message: { type: string } & Record<string, unknown>,
    ): Promise<T> => {
      if (message.type === "clacamieu/dashboard/cycle/dismiss") {
        const id = String(message.entity_id);
        const at = Date.parse(String(message.ended_at));
        if (Number.isFinite(at) && !(dismissed[id] >= at)) dismissed[id] = at;
        return cycles() as T;
      }
      if (message.type === "clacamieu/dashboard/cycles") return cycles() as T;
      if (message.type === "clacamieu/dashboard/config/update") {
        config = parseDashboardConfig(message);
        return structuredClone(config) as T;
      }
      if (message.type === "clacamieu/dashboard/config")
        return structuredClone(config) as T;
      return calls.callWS<T>(message);
    },
  };
}

export interface CompactEntities {
  entity_categories: Record<string, string>;
  entities: {
    ei: string;
    di?: string;
    ai?: string;
    hb?: boolean;
    ec?: number;
    en?: string;
    pl?: string;
    tk?: string;
  }[];
}

export function decodeEntities(
  result: CompactEntities,
): Record<string, EntityDisplayEntry> {
  return Object.fromEntries(
    result.entities.map((entry) => [
      entry.ei,
      {
        entity_id: entry.ei,
        device_id: entry.di,
        area_id: entry.ai,
        hidden: entry.hb,
        entity_category:
          entry.ec == null ? undefined : result.entity_categories[entry.ec],
        name: entry.en,
        platform: entry.pl,
        translation_key: entry.tk,
      },
    ]),
  );
}

export async function createDevHass(
  url: string,
  token: string,
  services: boolean,
  onChange: (hass: HassLike) => void,
): Promise<() => void> {
  const connection = await createConnection({
    auth: createLongLivedTokenAuth(url, token),
    setupRetry: 0,
  });
  const readOnly = readOnlyCalls(
    <T>(message: { type: string } & Record<string, unknown>) =>
      connection.sendMessagePromise<T>(message),
  );
  const calls: Pick<HassLike, "callWS" | "callService"> = services
    ? {
        ...readOnly,
        callService: (domain, service, data, target) =>
          callService(connection, domain, service, data, target),
      }
    : readOnly;
  try {
    const [areas, devices, entities, panels, user, config, floors] =
      await Promise.all([
        calls.callWS<AreaEntry[]>({ type: "config/area_registry/list" }),
        calls.callWS<DeviceEntry[]>({ type: "config/device_registry/list" }),
        calls.callWS<CompactEntities>({
          type: "config/entity_registry/list_for_display",
        }),
        calls.callWS<Record<string, PanelEntry>>({ type: "get_panels" }),
        calls.callWS<HassLike["user"]>({ type: "auth/current_user" }),
        calls.callWS<{ language: string; time_zone: string }>({
          type: "get_config",
        }),
        calls.callWS<NonNullable<HassLike["floors"]>[string][]>({
          type: "config/floor_registry/list",
        }),
      ]);
    const [dashboard, dismissals] = await Promise.all(
      ["clacamieu/dashboard/config", "clacamieu/dashboard/cycles"].map((type) =>
        calls.callWS<unknown>({ type }).catch(() => null),
      ),
    );
    let snapshot: HassLike = {
      ...developmentDashboardCalls(
        calls,
        parseDashboardConfig(dashboard),
        parseCycleDismissals(dismissals),
      ),
      hassUrl: (path) => new URL(path, url).href,
      connection: readOnlyConnection(connection),
      floors: Object.fromEntries(
        floors.map((floor) => [floor.floor_id, floor]),
      ),
      states: {},
      areas: Object.fromEntries(areas.map((area) => [area.area_id, area])),
      devices: Object.fromEntries(devices.map((device) => [device.id, device])),
      entities: decodeEntities(entities),
      panels,
      user,
      language: config.language,
      config: { time_zone: config.time_zone },
    };
    const unsubscribe = subscribeEntities(connection, (states) => {
      snapshot = { ...snapshot, states };
      onChange(snapshot);
    });
    return () => {
      unsubscribe();
      connection.close();
    };
  } catch {
    connection.close();
    throw new Error("Unable to initialize the development connection.");
  }
}
