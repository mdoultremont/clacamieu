import { useEffect, useRef, useState } from "react";
import type { HistoryPoint } from "./climate-trend";
import type { HassEntity, HassLike } from "./types";

/** The recorder keeps ten days of history by default. */
export const sensorHistoryDays = 10;

const settled = (state: string) => !["unavailable", "unknown"].includes(state);

/**
 * When a sensor moved to its current state. A Home Assistant restart resets
 * `last_changed` without a real change, and an unavailable spell is not a
 * change either, so both are read through. Null when the sensor held its
 * state for the whole history.
 */
export function lastStateChange(
  points: HistoryPoint[],
  entity: Pick<HassEntity, "state" | "last_changed">,
): number | null {
  let since: number | null = null;
  for (const point of [...points].reverse()) {
    if (!settled(point.s)) continue;
    if (point.s !== entity.state) break;
    since = point.lu * 1000;
  }
  if (since === null) return Date.parse(entity.last_changed);
  return since === points.find((point) => settled(point.s))!.lu * 1000
    ? null
    : since;
}

/**
 * Each sensor's last real change from its history, read again whenever one of
 * them changes state. Absent until the history arrives.
 */
export function useLastChanges(
  hass: HassLike,
  entities: HassEntity[],
): Record<string, number | null> | null {
  const [changes, setChanges] = useState<Record<string, number | null> | null>(
    null,
  );
  const latest = useRef({ hass, entities });
  latest.current = { hass, entities };
  const key = entities
    .map((entity) => `${entity.entity_id}=${entity.state}`)
    .join();
  useEffect(() => {
    const { hass, entities } = latest.current;
    if (!entities.length) return;
    let active = true;
    hass
      .callWS<Record<string, HistoryPoint[]>>({
        type: "history/history_during_period",
        start_time: new Date(
          Date.now() - sensorHistoryDays * 86_400_000,
        ).toISOString(),
        entity_ids: entities.map((entity) => entity.entity_id),
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
      })
      .then(
        (history) =>
          active &&
          setChanges(
            Object.fromEntries(
              entities.map((entity) => [
                entity.entity_id,
                lastStateChange(history?.[entity.entity_id] ?? [], entity),
              ]),
            ),
          ),
        () => active && setChanges({}),
      );
    return () => {
      active = false;
    };
  }, [key]);
  return changes;
}
