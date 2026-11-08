import { useState, type ReactNode } from "react";
import { cn } from "cn";
import {
  formatClimate,
  sortComfortRooms,
  type ComfortFilter,
  type ComfortView,
} from "../comfort-view";
import { Tray } from "./tray";
import { messages } from "../i18n";
import { Meter, co2Scale, humidityScale } from "./air-meter";
import { RouteLink } from "./route-link";
import { BackLink } from "./back-link";
import { Segmented, SegmentedItem } from "./ui/segmented";

export function Comfort({
  view,
  language,
}: {
  view: ComfortView;
  language: string;
}) {
  const t = messages(language);
  const [filter, setFilter] = useState<ComfortFilter>("all");
  const filters = [
    { key: "all", label: t.allRooms },
    { key: "co2", label: t.co2 },
    { key: "humidity", label: t.humidity },
    { key: "dewPoint", label: t.dewPoint },
  ] as const;
  return (
    <>
      <header className="space-y-2">
        <BackLink fallback={{ screen: "more" }} language={language} />
        <h1 className="text-xl font-semibold tracking-tight">{t.comfort}</h1>
        <p className="text-muted-foreground">
          {t.indoorAverage} ·{" "}
          {[view.temperature, view.humidity].filter(Boolean).join(" · ") ||
            t.noClimate}
        </p>
      </header>
      <Segmented
        className="max-w-full flex-wrap"
        aria-label={t.comfortFilter}
        value={filter}
        onValueChange={(value) => setFilter(value as ComfortFilter)}
      >
        {filters.map(({ key, label }) => (
          <SegmentedItem key={key} value={key} className="min-h-11 flex-none">
            {label}
          </SegmentedItem>
        ))}
      </Segmented>
      <section aria-label={t.rooms} className="flex flex-col gap-2">
        {sortComfortRooms(view.rooms, filter).map((room) => {
          const temperature = formatClimate(
            room.temperature,
            language,
            room.temperatureUnit,
          );
          const humidity = formatClimate(room.humidity, language, "%");
          const co2 = formatClimate(room.co2, language, "ppm");
          const dewPoint = formatClimate(
            room.dewPoint,
            language,
            room.dewPointUnit,
          );
          const headline =
            filter === "all"
              ? temperature
              : filter === "humidity"
                ? humidity
                : filter === "co2"
                  ? co2
                  : dewPoint;
          const subtitle = room.problems.length
            ? room.problems.join(" · ")
            : [
                filter !== "all" ? temperature : null,
                room.perception,
                filter !== "dewPoint" && dewPoint
                  ? `${t.dewPoint} ${dewPoint}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ");
          return (
            <Tray key={room.id}>
              <RouteLink
                route={{ screen: "room", areaId: room.id }}
                className="tray-card flex flex-col gap-3 p-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-muted/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{room.name}</p>
                    {subtitle && (
                      <p
                        className={cn(
                          "text-sm tabular-nums",
                          room.problems.length
                            ? "font-medium text-air-poor"
                            : "text-muted-foreground",
                        )}
                      >
                        {subtitle}
                      </p>
                    )}
                  </div>
                  <span
                    data-slot="comfort-headline"
                    className="shrink-0 text-2xl font-semibold tracking-tight tabular-nums"
                  >
                    {headline ?? "—"}
                  </span>
                </div>
                {room.co2 !== null && (
                  <MeterRow
                    label={t.co2}
                    value={co2!}
                    alert={room.co2 > 1200}
                    meter={<Meter value={room.co2} scale={co2Scale} />}
                  />
                )}
                {room.humidity !== null && (
                  <MeterRow
                    label={t.humidity}
                    value={humidity!}
                    alert={room.humidity > 70}
                    meter={
                      <Meter value={room.humidity} scale={humidityScale} />
                    }
                  />
                )}
                {room.temperature === null &&
                  room.humidity === null &&
                  room.co2 === null && (
                    <p className="text-sm text-muted-foreground">
                      {t.unavailable}
                    </p>
                  )}
              </RouteLink>
            </Tray>
          );
        })}
        {view.rooms.length === 0 && (
          <p className="text-muted-foreground">{t.noRooms}</p>
        )}
      </section>
    </>
  );
}

function MeterRow({
  label,
  value,
  alert,
  meter,
}: {
  label: string;
  value: string;
  alert: boolean;
  meter: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr_4.5rem] items-center gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {meter}
      <span
        className={cn(
          "text-right tabular-nums",
          alert ? "font-medium text-air-poor" : "text-muted-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}
