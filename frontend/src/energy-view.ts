import { numeric, plugPowerEntities } from "./home-view";
import { locale } from "./i18n";
import type { HassLike } from "./types";

export type EnergyPeriod = "day" | "week" | "month" | "year";
export interface EnergyFlow {
  stat_energy_from: string;
  entity_energy_price?: string | null;
  number_energy_price?: number | null;
}
export interface EnergyPrefs {
  energy_sources?: ({
    type: string;
    flow_from?: EnergyFlow[];
  } & Partial<EnergyFlow>)[];
  device_consumption?: { stat_consumption: string; name?: string }[];
}
export interface StatisticPoint {
  start: number;
  end: number;
  change: number | null;
}
export type EnergyStatistics = Record<string, StatisticPoint[]>;
export interface EnergyMetadata {
  statistic_id: string;
  name?: string | null;
  unit_of_measurement?: string | null;
}
export interface EnergyHistory {
  current: EnergyStatistics;
  previous: EnergyStatistics;
  metadata: EnergyMetadata[];
}
export interface EnergyBucket {
  start: number;
  end: number;
  label: string;
  description: string;
  kwh: number | null;
  current: boolean;
}
export interface EnergyView {
  configured: boolean;
  watts: number | null;
  kwh: number | null;
  cost: number | null;
  change: number | null;
  partial: boolean;
  buckets: EnergyBucket[];
  devices: {
    id: string;
    name: string;
    kwh: number | null;
    share: number | null;
    watts: number | null;
    cost: number | null;
  }[];
}

function calendarDate(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const part = (type: string) =>
    Number(parts.find((part) => part.type === type)!.value);
  return new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
}

function midnight(date: Date, timeZone: string): number {
  const target = date.getTime();
  let result = target;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = formatter.formatToParts(result);
    const part = (type: string) =>
      Number(parts.find((part) => part.type === type)!.value);
    const local = Date.UTC(
      part("year"),
      part("month") - 1,
      part("day"),
      part("hour"),
      part("minute"),
      part("second"),
    );
    const correction = target - local;
    result += correction;
    if (!correction) break;
  }
  return result;
}

export function energyTimeZone(hass: HassLike): string {
  return (
    hass.config?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  );
}

export function energyRange(period: EnergyPeriod, now: Date, timeZone: string) {
  const start = calendarDate(now, timeZone);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  if (period === "week") start.setUTCDate(start.getUTCDate() - 6);
  if (period === "month") {
    start.setUTCDate(1);
    end.setTime(start.getTime());
    end.setUTCMonth(end.getUTCMonth() + 1);
  }
  if (period === "year") {
    start.setUTCMonth(0, 1);
    end.setUTCFullYear(start.getUTCFullYear() + 1, 0, 1);
  }
  const previous = new Date(start);
  if (period === "year") previous.setUTCFullYear(previous.getUTCFullYear() - 1);
  else
    previous.setUTCDate(
      previous.getUTCDate() -
        Math.round((end.getTime() - start.getTime()) / 86_400_000),
    );
  const bucketPeriod =
    period === "day" ? "hour" : period === "year" ? "month" : "day";
  const boundaries = [midnight(start, timeZone)];
  const endTime = midnight(end, timeZone);
  if (bucketPeriod === "hour") {
    while (boundaries.at(-1)! < endTime)
      boundaries.push(boundaries.at(-1)! + 3_600_000);
  } else {
    const cursor = new Date(start);
    while (boundaries.at(-1)! < endTime) {
      if (bucketPeriod === "month")
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      else cursor.setUTCDate(cursor.getUTCDate() + 1);
      boundaries.push(midnight(cursor, timeZone));
    }
  }
  return {
    start: boundaries[0],
    end: endTime,
    previousStart: midnight(previous, timeZone),
    previousEnd: boundaries[0],
    bucketPeriod,
    boundaries,
  };
}

export function energySources(prefs: EnergyPrefs) {
  const flows =
    prefs.energy_sources
      ?.filter((source) => source.type === "grid")
      .flatMap(
        (source) =>
          source.flow_from ??
          (source.stat_energy_from
            ? [
                {
                  stat_energy_from: source.stat_energy_from,
                  entity_energy_price: source.entity_energy_price,
                  number_energy_price: source.number_energy_price,
                },
              ]
            : []),
      ) ?? [];
  const deviceIds = [
    ...new Set(
      prefs.device_consumption?.map((device) => device.stat_consumption) ?? [],
    ),
  ];
  const totalIds = flows.length
    ? [...new Set(flows.map((flow) => flow.stat_energy_from))]
    : deviceIds;
  return {
    flows,
    deviceIds,
    totalIds,
    statisticIds: [...new Set([...totalIds, ...deviceIds])],
  };
}

function sum(values: (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((total, value) => total + value, 0) : null;
}

function consumption(
  statistics: EnergyStatistics,
  id: string,
  start: number,
  end: number,
): number | null {
  return sum(
    (statistics[id] ?? [])
      .filter((point) => point.start >= start && point.start < end)
      .map((point) => numeric(point.change)),
  );
}

function watts(hass: HassLike, id: string): number | null {
  const entity = hass.states[id];
  const value = numeric(entity?.state);
  if (value === null) return null;
  return value * (entity.attributes.unit_of_measurement === "kW" ? 1000 : 1);
}

export function buildEnergyView(
  prefs: EnergyPrefs,
  statistics: EnergyHistory,
  hass: HassLike,
  period: EnergyPeriod,
  now: Date,
): EnergyView {
  const timeZone = energyTimeZone(hass);
  const range = energyRange(period, now, timeZone);
  const { flows, deviceIds, totalIds } = energySources(prefs);
  const totals = totalIds.map((id) =>
    consumption(statistics.current, id, range.start, range.end),
  );
  const kwh = sum(totals);
  const previous = sum(
    totalIds.map((id) =>
      consumption(
        statistics.previous,
        id,
        range.previousStart,
        range.previousEnd,
      ),
    ),
  );
  const prices = flows.map((flow) =>
    flow.entity_energy_price
      ? numeric(hass.states[flow.entity_energy_price]?.state)
      : numeric(flow.number_energy_price),
  );
  const devicePrice =
    prices.length &&
    prices.every((price) => price !== null && price === prices[0])
      ? prices[0]
      : null;
  const cost =
    flows.length &&
    prices.every((price) => price !== null) &&
    totals.every((value) => value !== null)
      ? sum(
          flows.map((flow, i) => {
            const value = consumption(
              statistics.current,
              flow.stat_energy_from,
              range.start,
              range.end,
            );
            return value === null ? null : value * prices[i]!;
          }),
        )
      : null;
  const language = locale(hass.language);
  const label = new Intl.DateTimeFormat(language, {
    timeZone,
    ...(period === "day"
      ? { hour: "2-digit", hourCycle: "h23" }
      : period === "year"
        ? { month: "short" }
        : {
            day: "numeric",
            ...(period === "week" ? { weekday: "short" } : {}),
          }),
  });
  const description = new Intl.DateTimeFormat(language, {
    timeZone,
    month: "short",
    day: "numeric",
    ...(period === "day"
      ? { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }
      : {}),
  });
  const buckets = range.boundaries.slice(0, -1).map((start, index) => {
    const end = range.boundaries[index + 1];
    return {
      start,
      end,
      label: label.format(start),
      description: description.format(start),
      kwh: sum(
        totalIds.map((id) => consumption(statistics.current, id, start, end)),
      ),
      current: start <= now.getTime() && now.getTime() < end,
    };
  });
  return {
    configured: totalIds.length > 0,
    watts: sum(
      plugPowerEntities(hass).map((entity) => watts(hass, entity.entity_id)),
    ),
    kwh,
    cost,
    change:
      kwh !== null && previous !== null && previous > 0
        ? ((kwh - previous) / previous) * 100
        : null,
    partial: buckets.some(
      (bucket) =>
        bucket.start < now.getTime() &&
        totalIds.some(
          (id) =>
            consumption(statistics.current, id, bucket.start, bucket.end) ===
            null,
        ),
    ),
    buckets,
    devices: deviceIds
      .map((id) => {
        const value = consumption(
          statistics.current,
          id,
          range.start,
          range.end,
        );
        const deviceId = hass.entities[id]?.device_id;
        const power = deviceId
          ? Object.values(hass.states)
              .filter(
                (entity) =>
                  entity.attributes.device_class === "power" &&
                  hass.entities[entity.entity_id]?.device_id === deviceId &&
                  !hass.entities[entity.entity_id]?.hidden &&
                  !hass.entities[entity.entity_id]?.entity_category,
              )
              .map((entity) => watts(hass, entity.entity_id))
          : [];
        return {
          id,
          name:
            hass.states[id]?.attributes.friendly_name ??
            statistics.metadata.find((entry) => entry.statistic_id === id)
              ?.name ??
            prefs.device_consumption?.find(
              (device) => device.stat_consumption === id,
            )?.name ??
            id,
          kwh: value,
          share:
            value !== null && kwh !== null && kwh > 0
              ? (value / kwh) * 100
              : null,
          watts: sum(power),
          cost:
            value !== null && devicePrice !== null ? value * devicePrice : null,
        };
      })
      .sort(
        (a, b) =>
          (b.kwh ?? -Infinity) - (a.kwh ?? -Infinity) ||
          a.name.localeCompare(b.name, language),
      ),
  };
}
