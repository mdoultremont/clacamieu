import { useEffect, useRef, useState } from "react";
import {
  activityEntityIds,
  activityWindowHours,
  type LogbookEntry,
} from "./activity-view";
import type { HassLike } from "./types";

/**
 * Reads the followed sensors' logbook for the last 24 hours, and again each
 * time one of them changes state. Null while loading or when the read fails.
 */
export function useActivity(hass: HassLike): LogbookEntry[] | null {
  const [entries, setEntries] = useState<LogbookEntry[] | null>(null);
  const latestHass = useRef(hass);
  latestHass.current = hass;
  const ids = activityEntityIds(hass);
  const signature = ids
    .map((id) => `${id}@${hass.states[id]?.last_changed ?? ""}`)
    .join();
  useEffect(() => {
    if (!ids.length) {
      setEntries([]);
      return;
    }
    let active = true;
    const start = new Date(Date.now() - activityWindowHours * 3600_000);
    latestHass.current
      .callWS<LogbookEntry[]>({
        type: "logbook/get_events",
        start_time: start.toISOString(),
        entity_ids: ids,
      })
      .then(
        (result) => active && setEntries(Array.isArray(result) ? result : []),
        () => active && setEntries(null),
      );
    return () => {
      active = false;
    };
    // The signature covers the ids and their last change.
  }, [signature]);
  return entries;
}
