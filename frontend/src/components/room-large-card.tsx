import type { ReactNode } from "react";
import { cn } from "cn";
import { messages } from "../i18n";
import { buildLargeCardFooter, type RoomCard as RoomCardData } from "../room-card";
import type { ServiceAction } from "../types";
import { co2Scale, humidityScale, Meter } from "./air-meter";
import { FooterItem, RoomLightButton, RoomName } from "./room-card";
import { RouteLink } from "./route-link";
import { Tray, TrayLine } from "./tray";

/** A main room on Pièces: full width, with climate columns and every other reading in its tray line. */
export function RoomLargeCard({
  room,
  today,
  language,
  busy,
  onAction,
}: {
  room: RoomCardData;
  today: Record<string, number | null> | null;
  language: string;
  busy: boolean;
  onAction: (action: ServiceAction) => unknown;
}) {
  const t = messages(language);
  const footer = buildLargeCardFooter(room, today, language);
  const { status, humidity, co2 } = room;
  return (
    <Tray className="relative">
      <RouteLink
        route={{ screen: "room", areaId: room.id }}
        aria-label={t.openRoom(room.name)}
        className="absolute inset-0 z-10 rounded-[inherit] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-foreground/5"
      />
      <div className="tray-card flex flex-col gap-3 px-3 py-[11px]">
        <div className="flex items-center gap-2.5">
          <RoomLightButton
            room={room}
            language={language}
            busy={busy}
            onAction={onAction}
          />
          <RoomName room={room} language={language} className="flex-1" />
          {status && (
            <p
              className={cn(
                "shrink-0 text-xs",
                status.level === "fair"
                  ? "text-air-fair"
                  : status.level === "poor"
                    ? "font-medium text-air-poor"
                    : "text-muted-foreground",
              )}
            >
              {status.text}
            </p>
          )}
        </div>
        <dl className="grid grid-cols-3 divide-x">
          <Column label={t.temperature}>
            {room.temperature !== null && `${room.temperature}°`}
          </Column>
          <Column
            label={t.humidity}
            unit="%"
            meter={
              humidity && (
                <Meter value={humidity.percent} scale={humidityScale} size="sm" />
              )
            }
          >
            {humidity?.value}
          </Column>
          <Column
            label={t.co2}
            unit="ppm"
            valueClassName={cn(
              co2?.level === "fair" && "text-air-fair",
              co2?.level === "poor" && "text-air-poor",
            )}
            meter={co2 && <Meter value={co2.ppm} scale={co2Scale} size="sm" />}
          >
            {co2?.value}
          </Column>
        </dl>
      </div>
      {footer.length > 0 && (
        <TrayLine className="flex-wrap gap-x-3 gap-y-1 whitespace-normal tabular-nums">
          {footer.map((item) => (
            <FooterItem key={item.kind} item={item} />
          ))}
        </TrayLine>
      )}
    </Tray>
  );
}

function Column({
  label,
  unit,
  meter,
  valueClassName,
  children,
}: {
  label: string;
  unit?: string;
  meter?: ReactNode;
  valueClassName?: string;
  children: ReactNode;
}) {
  const known = children !== undefined && children !== null && children !== false;
  return (
    <div className="flex min-w-0 flex-col gap-1 px-3 first:pl-0 last:pr-0">
      <dt className="truncate text-[0.6875rem] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "truncate text-[1.0625rem] leading-tight font-semibold tracking-tight tabular-nums",
          known ? valueClassName : "text-muted-foreground",
        )}
      >
        {known ? children : "–"}
        {known && unit && (
          <span className="ml-1 text-[0.6875rem] font-normal text-muted-foreground">
            {unit}
          </span>
        )}
      </dd>
      {meter && <dd className="mt-1">{meter}</dd>}
    </div>
  );
}
