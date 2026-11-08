import { Siren } from "lucide-react";
import { elapsed } from "../security-view";
import { messages } from "../i18n";
import type { SensorClass } from "../room-view";
import { sensorHistoryDays, useLastChanges } from "../sensor-history";
import type { HassLike } from "../types";
import { activeIcons, entityIcons } from "./entity-icon";
import { EntityRows } from "./entity-rows";

export interface SensorRow {
  id: string;
  name: string;
  /** The state as the user reads it, such as "Closed". */
  state: string;
  deviceClass: string;
  /** Open, wet, or detecting: worth noticing. */
  active: boolean;
  /** Active and a problem, such as a leak or smoke. */
  alert: boolean;
  available: boolean;
}

/**
 * Binary sensors as one-line rows: the state, then how long it has held,
 * read from history so a Home Assistant restart doesn't reset it.
 */
export function SensorRows({
  sensors,
  hass,
  now,
  onMoreInfo,
}: {
  sensors: SensorRow[];
  hass: HassLike;
  now: Date;
  onMoreInfo: (entityId: string) => void;
}) {
  const t = messages(hass.language);
  const changes = useLastChanges(
    hass,
    sensors.flatMap((sensor) => hass.states[sensor.id] ?? []),
  );
  const held = (sensor: SensorRow) => {
    if (!sensor.available || !changes) return undefined;
    const at =
      sensor.id in changes
        ? changes[sensor.id]
        : Date.parse(hass.states[sensor.id]?.last_changed ?? "");
    if (at === null) return t.sinceOver(sensorHistoryDays);
    return Number.isFinite(at)
      ? t.since(elapsed(at, now, hass.language))
      : undefined;
  };
  return (
    <EntityRows
      onMoreInfo={onMoreInfo}
      rows={sensors.map((sensor) => {
        const deviceClass = sensor.deviceClass as SensorClass;
        return {
          id: sensor.id,
          name: sensor.name,
          value: sensor.state,
          detail: held(sensor),
          icon:
            (sensor.active && activeIcons[deviceClass]) ||
            entityIcons[deviceClass] ||
            Siren,
          active: sensor.active,
          alert: sensor.alert,
          unavailable: !sensor.available,
        };
      })}
    />
  );
}
