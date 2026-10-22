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
  device_consumption?: {
    stat_consumption: string;
    name?: string;
    included_in_stat?: string;
  }[];
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
  source: "grid" | "devices";
  watts: number | null;
  kwh: number | null;
  cost: number | null;
  change: number | null;
  partial: boolean;
  buckets: EnergyBucket[];
  devices: {
    id: string;
    name: string;
    includedIn: string | null;
    kwh: number | null;
    share: number | null;
    watts: number | null;
    cost: number | null;
  }[];
}

function calendarDate(date: Date, timeZone: string, withTime = false) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    ...(withTime
      ? {
          hour: "numeric",
          minute: "numeric",
          second: "numeric",
          hourCycle: "h23" as const,
        }
      : {}),
  }).formatToParts(date);
  const part = (type: string) =>
    Number(parts.find((part) => part.type === type)!.value);
  return new Date(
    Date.UTC(
      part("year"),
      part("month") - 1,
      part("day"),
      withTime ? part("hour") : 0,
      withTime ? part("minute") : 0,
      withTime ? part("second") : 0,
    ),
  );
}

function zonedTimestamp(date: Date, timeZone: string): number {
  const target = date.getTime();
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
  const wallClock = (instant: number) => {
    const parts = formatter.formatToParts(instant);
    const part = (type: string) =>
      Number(parts.find((part) => part.type === type)!.value);
    return Date.UTC(
      part("year"),
      part("month") - 1,
      part("day"),
      part("hour"),
      part("minute"),
      part("second"),
    );
  };
  const offsetBefore = wallClock(target - 86_400_000) - (target - 86_400_000);
  const offsetAfter = wallClock(target + 86_400_000) - (target + 86_400_000);
  // Like Temporal's "compatible": a repeated wall time takes its first instant,
  // and a skipped one keeps the offset in force before the change.
  const matches = [target - offsetBefore, target - offsetAfter].filter(
    (instant) => wallClock(instant) === target,
  );
  return matches.length ? Math.min(...matches) : target - offsetBefore;
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
  const previousClock = calendarDate(now, timeZone, true);
  if (period === "week") previous.setUTCDate(previous.getUTCDate() - 7);
  else if (period === "day") {
    previous.setUTCDate(previous.getUTCDate() - 1);
    previousClock.setUTCDate(previousClock.getUTCDate() - 1);
  } else {
    const day = previousClock.getUTCDate();
    previousClock.setUTCDate(1);
    if (period === "month") {
      previous.setUTCMonth(previous.getUTCMonth() - 1);
      previousClock.setUTCMonth(previousClock.getUTCMonth() - 1);
    } else {
      previous.setUTCFullYear(previous.getUTCFullYear() - 1);
      previousClock.setUTCFullYear(previousClock.getUTCFullYear() - 1);
    }
    const lastDay = new Date(
      Date.UTC(
        previousClock.getUTCFullYear(),
        previousClock.getUTCMonth() + 1,
        0,
      ),
    ).getUTCDate();
    previousClock.setUTCDate(Math.min(day, lastDay));
  }
  const previousStart = zonedTimestamp(previous, timeZone);
  const previousEnd =
    period === "week"
      ? zonedTimestamp(start, timeZone)
      : zonedTimestamp(previousClock, timeZone);
  const previousDay = new Date(previousClock);
  previousDay.setUTCHours(0, 0, 0, 0);
  const previousDayStart = zonedTimestamp(previousDay, timeZone);
  const previousRanges =
    period === "month" || period === "year"
      ? [
          {
            start: previousStart,
            end: previousDayStart,
            period: "day" as const,
          },
          {
            start: previousDayStart,
            end: previousEnd,
            period: "hour" as const,
          },
        ].filter((range) => range.start < range.end)
      : [
          {
            start: previousStart,
            end: previousEnd,
            period: period === "day" ? ("hour" as const) : ("day" as const),
          },
        ];
  const bucketPeriod =
    period === "day" ? "hour" : period === "year" ? "month" : "day";
  const boundaries = [zonedTimestamp(start, timeZone)];
  const endTime = zonedTimestamp(end, timeZone);
  if (bucketPeriod === "hour") {
    while (boundaries.at(-1)! < endTime)
      boundaries.push(boundaries.at(-1)! + 3_600_000);
  } else {
    const cursor = new Date(start);
    while (boundaries.at(-1)! < endTime) {
      if (bucketPeriod === "month")
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      else cursor.setUTCDate(cursor.getUTCDate() + 1);
      boundaries.push(zonedTimestamp(cursor, timeZone));
    }
  }
  return {
    start: boundaries[0],
    end: endTime,
    previousStart,
    previousEnd,
    previousRanges,
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
  const gridIds = [...new Set(flows.map((flow) => flow.stat_energy_from))];
  return {
    flows,
    deviceIds,
    gridIds,
    statisticIds: [...new Set([...gridIds, ...deviceIds])],
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
  completedOnly = false,
): number | null {
  return sum(
    (statistics[id] ?? [])
      .filter(
        (point) =>
          point.start >= start &&
          point.start < end &&
          (!completedOnly || point.end <= end),
      )
      .map((point) => numeric(point.change)),
  );
}

function watts(hass: HassLike, id: string): number | null {
  const entity = hass.states[id];
  const value = numeric(entity?.state);
  if (value === null) return null;
  return value * (entity.attributes.unit_of_measurement === "kW" ? 1000 : 1);
}

export function energyPricePerKwh(
  value: number | null,
  unit?: string,
): number | null {
  if (value === null) return null;
  const energyUnit = unit?.split("/")[1];
  return (
    value * (energyUnit === "MWh" ? 0.001 : energyUnit === "Wh" ? 1000 : 1)
  );
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
  const { flows, deviceIds, gridIds } = energySources(prefs);
  // An imported grid statistic can be configured yet empty or stuck at zero.
  const gridHasReadings = gridIds.some((id) =>
    [
      ...(statistics.current[id] ?? []),
      ...(statistics.previous[id] ?? []),
    ].some((point) => (numeric(point.change) ?? 0) !== 0),
  );
  const parents = new Map(
    prefs.device_consumption?.map((device) => [
      device.stat_consumption,
      device.included_in_stat,
    ]),
  );
  const topLevelIds = deviceIds.filter(
    (id) => !deviceIds.includes(parents.get(id) ?? ""),
  );
  const totalIds = gridHasReadings ? gridIds : topLevelIds;
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
        true,
      ),
    ),
  );
  const prices = flows.map((flow) => {
    const entity = flow.entity_energy_price
      ? hass.states[flow.entity_energy_price]
      : undefined;
    return flow.entity_energy_price
      ? energyPricePerKwh(
          numeric(entity?.state),
          entity?.attributes.unit_of_measurement,
        )
      : numeric(flow.number_energy_price);
  });
  const devicePrice =
    prices.length &&
    prices.every((price) => price !== null && price === prices[0])
      ? prices[0]
      : null;
  const cost =
    gridHasReadings &&
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
      : !gridHasReadings && kwh !== null && devicePrice !== null
        ? kwh * devicePrice
        : null;
  const deviceName = (id: string) =>
    prefs.device_consumption?.find((device) => device.stat_consumption === id)
      ?.name ??
    hass.states[id]?.attributes.friendly_name ??
    statistics.metadata.find((entry) => entry.statistic_id === id)?.name ??
    id;
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
    source: gridHasReadings ? "grid" : "devices",
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
        bucket.end <= now.getTime() &&
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
          name: deviceName(id),
          includedIn: deviceIds.includes(parents.get(id) ?? "")
            ? deviceName(parents.get(id)!)
            : null,
          kwh: value,
          share:
            topLevelIds.includes(id) &&
            value !== null &&
            kwh !== null &&
            kwh > 0
              ? (value / kwh) * 100
              : null,
          watts: power.some((value) => value !== null)
            ? Math.max(
                ...power.filter((value): value is number => value !== null),
              )
            : null,
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
