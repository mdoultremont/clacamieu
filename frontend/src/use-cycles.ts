import { useCallback, useEffect, useRef, useState } from "react";
import type { HistoryPoint } from "./climate-trend";
import {
  cycleHistoryMs,
  detectCycle,
  parseCycleDismissals,
  powerSamples,
  type CycleAppliance,
  type CycleState,
  type PowerSample,
} from "./cycle-view";
import { numeric } from "./home-view";
import type { HassLike } from "./types";

const refreshMs = 5 * 60_000;

/**
 * Each appliance's cycle, by entity ID. Reads twelve hours of power history
 * every five minutes and records live readings in between, so a dip and its
 * recovery between two reads still count.
 */
export function useCycles(
  hass: HassLike,
  appliances: Pick<CycleAppliance, "entityId" | "plug">[],
  now: Date,
): Record<string, CycleState> {
  const [history, setHistory] = useState<Record<string, PowerSample[]>>({});
  const [live, setLive] = useState<Record<string, PowerSample[]>>({});
  const latestHass = useRef(hass);
  latestHass.current = hass;
  const powerIds = [...new Set(appliances.map((item) => item.plug.powerId))];
  const key = powerIds.join();
  useEffect(() => {
    if (!powerIds.length) return;
    let active = true;
    const load = () =>
      latestHass.current
        .callWS<Record<string, HistoryPoint[]>>({
          type: "history/history_during_period",
          start_time: new Date(Date.now() - cycleHistoryMs).toISOString(),
          entity_ids: powerIds,
          minimal_response: true,
          no_attributes: true,
          significant_changes_only: false,
        })
        .then(
          (result) => {
            if (!active) return;
            const states = latestHass.current.states;
            const read = Object.fromEntries(
              powerIds.map((id) => [
                id,
                powerSamples(
                  result?.[id] ?? [],
                  states[id]?.attributes.unit_of_measurement,
                ),
              ]),
            );
            setHistory(read);
            setLive((current) =>
              Object.fromEntries(
                Object.entries(current).map(([id, samples]) => [
                  id,
                  samples.filter(
                    (sample) => sample.at > (read[id]?.at(-1)?.at ?? -Infinity),
                  ),
                ]),
              ),
            );
          },
          () => active && setHistory({}),
        );
    load();
    const timer = setInterval(load, refreshMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [key]);
  const liveKey = powerIds
    .map((id) => `${id}=${hass.states[id]?.last_changed}`)
    .join();
  useEffect(() => {
    setLive((current) =>
      Object.fromEntries(
        powerIds.map((id) => {
          const entity = hass.states[id];
          const samples = current[id] ?? [];
          if (!entity) return [id, samples];
          const value = numeric(entity.state);
          const sample = {
            at: Date.parse(entity.last_changed),
            watts:
              value === null
                ? null
                : value *
                  (entity.attributes.unit_of_measurement === "kW" ? 1000 : 1),
          };
          return [
            id,
            samples.at(-1)?.at === sample.at ? samples : [...samples, sample],
          ];
        }),
      ),
    );
  }, [liveKey]);
  return Object.fromEntries(
    appliances.map(({ entityId, plug }) => {
      const read = history[plug.powerId];
      if (!read) return [entityId, { status: "idle" }];
      const lastRead = read.at(-1)?.at ?? -Infinity;
      return [
        entityId,
        detectCycle(
          [
            ...read,
            ...(live[plug.powerId] ?? []).filter((sample) => sample.at > lastRead),
          ],
          now.getTime(),
        ),
      ];
    }),
  );
}

/** Ends of dismissed cycles by entity ID, shared by every user and device. */
export function useCycleDismissals(hass: HassLike) {
  const [dismissed, setDismissed] = useState<Record<string, number>>({});
  const latestHass = useRef(hass);
  latestHass.current = hass;
  useEffect(() => {
    let active = true;
    const load = () =>
      latestHass.current
        .callWS<unknown>({ type: "clacamieu/dashboard/cycles" })
        .then(
          (result) => active && setDismissed(parseCycleDismissals(result)),
          () => {},
        );
    load();
    const timer = setInterval(load, refreshMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [hass.callWS]);
  const dismiss = useCallback((entityId: string, endedAt: number) => {
    setDismissed((current) => ({ ...current, [entityId]: endedAt }));
    const send = (message: { type: string } & Record<string, unknown>) =>
      latestHass.current.callWS<unknown>(message);
    void send({
      type: "clacamieu/dashboard/cycle/dismiss",
      entity_id: entityId,
      ended_at: new Date(endedAt).toISOString(),
    })
      .catch(() => send({ type: "clacamieu/dashboard/cycles" }))
      .then(
        (result) => setDismissed(parseCycleDismissals(result)),
        () => {},
      );
  }, []);
  return { dismissed, dismiss };
}
