import { useEffect, useRef, useState } from "react";
import { trendWindowMinutes, type HistoryPoint } from "./climate-trend";
import type { HassLike } from "./types";

const refreshMs = 5 * 60_000;

/** Reads the last hour of these sensors, then again every five minutes. */
export function useClimateHistory(
  hass: HassLike,
  entityIds: string[],
): Record<string, HistoryPoint[]> {
  const [history, setHistory] = useState<Record<string, HistoryPoint[]>>({});
  const latestHass = useRef(hass);
  latestHass.current = hass;
  const key = entityIds.join();
  useEffect(() => {
    if (!entityIds.length) return;
    let active = true;
    const load = () =>
      latestHass.current
        .callWS<Record<string, HistoryPoint[]>>({
          type: "history/history_during_period",
          start_time: new Date(
            Date.now() - trendWindowMinutes * 60_000,
          ).toISOString(),
          entity_ids: entityIds,
          minimal_response: true,
          no_attributes: true,
          significant_changes_only: false,
        })
        .then(
          (result) => active && setHistory(result ?? {}),
          () => active && setHistory({}),
        );
    load();
    const timer = setInterval(load, refreshMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [key]);
  return history;
}
