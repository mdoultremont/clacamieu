import { useEffect, useRef, useState } from "react";
import {
  energyRange,
  energySources,
  energyTimeZone,
  type EnergyHistory,
  type EnergyMetadata,
  type EnergyPeriod,
  type EnergyPrefs,
  type EnergyStatistics,
} from "./energy-view";
import type { HassLike } from "./types";

type EnergyState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error" }
  | {
      status: "ready";
      prefs: EnergyPrefs;
      statistics: EnergyHistory;
      now: Date;
    };

export function useEnergy(hass: HassLike, period: EnergyPeriod) {
  const [state, setState] = useState<EnergyState>({ status: "loading" });
  const [revision, setRevision] = useState(0);
  const latestHass = useRef(hass);
  latestHass.current = hass;
  const timeZone = energyTimeZone(hass);
  useEffect(() => {
    setState({ status: "loading" });
  }, [period, timeZone]);
  useEffect(() => {
    let active = true;
    async function load() {
      const source = latestHass.current;
      const prefs = await source
        .callWS<EnergyPrefs>({ type: "energy/get_prefs" })
        .catch(() => null);
      if (!active) return;
      if (!prefs || !energySources(prefs).statisticIds.length) {
        setState({ status: "empty" });
        return;
      }
      const now = new Date();
      const range = energyRange(period, now, timeZone);
      const ids = energySources(prefs).statisticIds;
      const metadataIds = ids.filter((id) => !source.states[id]);
      const request = (
        start: number,
        end: number,
        bucketPeriod = range.bucketPeriod,
      ) =>
        source.callWS<EnergyStatistics>({
          type: "recorder/statistics_during_period",
          statistic_ids: ids,
          start_time: new Date(start).toISOString(),
          end_time: new Date(end).toISOString(),
          period: bucketPeriod,
          types: ["change"],
          units: { energy: "kWh" },
        });
      try {
        const [current, previous, metadata] = await Promise.all([
          request(range.start, range.end),
          Promise.all(
            range.previousRanges.map(async (segment) => {
              const data = await request(
                segment.start,
                segment.end,
                segment.period,
              );
              return Object.fromEntries(
                Object.entries(data).map(([id, points]) => [
                  id,
                  points.filter(
                    (point) =>
                      point.start >= segment.start && point.end <= segment.end,
                  ),
                ]),
              );
            }),
          ).then((segments) => {
            const combined: EnergyStatistics = {};
            for (const segment of segments)
              for (const [id, points] of Object.entries(segment))
                (combined[id] ??= []).push(...points);
            return combined;
          }),
          metadataIds.length
            ? source.callWS<EnergyMetadata[]>({
                type: "recorder/get_statistics_metadata",
                statistic_ids: metadataIds,
              })
            : Promise.resolve([]),
        ]);
        if (active)
          setState({
            status: "ready",
            prefs,
            statistics: { current, previous, metadata },
            now,
          });
      } catch {
        if (active) setState({ status: "error" });
      }
    }
    void load();
    const timer = window.setInterval(
      () => setRevision((value) => value + 1),
      300_000,
    );
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [hass.callWS, period, timeZone, revision]);
  return { state, reload: () => setRevision((value) => value + 1) };
}
