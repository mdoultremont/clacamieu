import { useEffect, useRef, useState } from "react";
import type { HistoryPoint } from "./climate-trend";
import type { HassLike } from "./types";
import { type CleaningHistory, roomHistoryDays } from "./vacuum-view";

const empty: CleaningHistory = { vacuum: [], room: [] };

/** Reads the vacuum's state and current-room history again whenever `refresh` changes. */
export function useRoomHistory(
  hass: HassLike,
  vacuumId: string | null,
  roomId: string | null,
  refresh: string,
): CleaningHistory {
  const [history, setHistory] = useState<CleaningHistory>(empty);
  const latestHass = useRef(hass);
  latestHass.current = hass;
  useEffect(() => {
    if (!vacuumId || !roomId) return;
    let active = true;
    latestHass.current
      .callWS<Record<string, HistoryPoint[]>>({
        type: "history/history_during_period",
        start_time: new Date(
          Date.now() - roomHistoryDays * 86_400_000,
        ).toISOString(),
        entity_ids: [vacuumId, roomId],
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
      })
      .then(
        (result) =>
          active &&
          setHistory({
            vacuum: result?.[vacuumId] ?? [],
            room: result?.[roomId] ?? [],
          }),
        () => active && setHistory(empty),
      );
    return () => {
      active = false;
    };
  }, [vacuumId, roomId, refresh]);
  return history;
}
