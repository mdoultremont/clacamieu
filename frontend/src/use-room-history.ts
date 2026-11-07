import { useEffect, useRef, useState } from "react";
import type { HistoryPoint } from "./climate-trend";
import type { HassLike } from "./types";
import { roomHistoryDays } from "./vacuum-view";

/** Reads the vacuum's current-room history again whenever `refresh` changes. */
export function useRoomHistory(
  hass: HassLike,
  entityId: string | null,
  refresh: string,
): HistoryPoint[] {
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const latestHass = useRef(hass);
  latestHass.current = hass;
  useEffect(() => {
    if (!entityId) return;
    let active = true;
    latestHass.current
      .callWS<Record<string, HistoryPoint[]>>({
        type: "history/history_during_period",
        start_time: new Date(
          Date.now() - roomHistoryDays * 86_400_000,
        ).toISOString(),
        entity_ids: [entityId],
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
      })
      .then(
        (result) => active && setHistory(result?.[entityId] ?? []),
        () => active && setHistory([]),
      );
    return () => {
      active = false;
    };
  }, [entityId, refresh]);
  return history;
}
