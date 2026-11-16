import { cn } from "cn";
import { messages } from "../i18n";
import {
  buildLargeCardFooter,
  hasDeviceMarks,
  type RoomCard as RoomCardData,
} from "../room-card";
import type { ServiceAction } from "../types";
import { co2Scale, Meter } from "./air-meter";
import { FooterItem, RoomLightButton, RoomMarks } from "./room-card";
import { RouteLink } from "./route-link";
import { Tray, TrayLine } from "./tray";

const levelText = {
  good: null,
  fair: "text-air-fair",
  poor: "text-air-poor",
} satisfies Record<NonNullable<RoomCardData["co2"]>["level"], string | null>;

/**
 * A main room on Pièces: full width, with the temperature where the tile
 * shows it, a CO₂ line when the room measures it, and every other reading
 * in its tray line.
 */
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
  const { status, co2 } = room;
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
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{room.name}</p>
            {status && (
              <p
                className={cn(
                  "truncate text-xs",
                  status.level === "poor" && "font-medium",
                  status.level
                    ? levelText[status.level]
                    : "text-muted-foreground",
                )}
              >
                {status.text}
              </p>
            )}
          </div>
          {room.temperature !== null && (
            <span className="shrink-0 text-xl font-semibold tracking-tight tabular-nums">
              {room.temperature}°
            </span>
          )}
        </div>
        {co2 && (
          <div className="flex items-center gap-2.5">
            <dl className="flex shrink-0 items-baseline gap-2">
              <dt className="text-xs text-muted-foreground">{t.co2}</dt>
              <dd
                className={cn(
                  "text-[0.9375rem] font-semibold tracking-tight tabular-nums",
                  levelText[co2.level],
                )}
              >
                {co2.value}
                <span className="ml-1 text-[0.6875rem] font-normal text-muted-foreground">
                  ppm
                </span>
              </dd>
            </dl>
            <Meter
              value={co2.ppm}
              scale={co2Scale}
              size="sm"
              className="flex-1"
            />
          </div>
        )}
      </div>
      {(footer.length > 0 || hasDeviceMarks(room)) && (
        <TrayLine className="flex-wrap gap-x-3 gap-y-1 whitespace-normal tabular-nums">
          {footer.map((item) => (
            <FooterItem key={item.kind} item={item} />
          ))}
          <RoomMarks room={room} language={language} className="ml-auto" />
        </TrayLine>
      )}
    </Tray>
  );
}
