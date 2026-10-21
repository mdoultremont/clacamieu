import {
  createConnection,
  createLongLivedTokenAuth,
  subscribeEntities,
} from "home-assistant-js-websocket";
import type {
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
  "config/device_registry/list",
  "config/entity_registry/list_for_display",
  "get_panels",
  "auth/current_user",
  "get_config",
  "clacamieu/dashboard/config",
  "frontend/get_user_data",
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

export interface CompactEntities {
  entity_categories: Record<string, string>;
  entities: {
    ei: string;
    di?: string;
    ai?: string;
    hb?: boolean;
    ec?: number;
    en?: string;
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
      },
    ]),
  );
}

export async function createDevHass(
  url: string,
  token: string,
  onChange: (hass: HassLike) => void,
): Promise<() => void> {
  const connection = await createConnection({
    auth: createLongLivedTokenAuth(url, token),
    setupRetry: 0,
  });
  const calls = readOnlyCalls(
    <T>(message: { type: string } & Record<string, unknown>) =>
      connection.sendMessagePromise<T>(message),
  );
  try {
    const [areas, devices, entities, panels, user, config] = await Promise.all([
      calls.callWS<AreaEntry[]>({ type: "config/area_registry/list" }),
      calls.callWS<DeviceEntry[]>({ type: "config/device_registry/list" }),
      calls.callWS<CompactEntities>({
        type: "config/entity_registry/list_for_display",
      }),
      calls.callWS<Record<string, PanelEntry>>({ type: "get_panels" }),
      calls.callWS<HassLike["user"]>({ type: "auth/current_user" }),
      calls.callWS<{ language: string }>({ type: "get_config" }),
    ]);
    let snapshot: HassLike = {
      ...calls,
      states: {},
      areas: Object.fromEntries(areas.map((area) => [area.area_id, area])),
      devices: Object.fromEntries(devices.map((device) => [device.id, device])),
      entities: decodeEntities(entities),
      panels,
      user,
      language: config.language,
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
