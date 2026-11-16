import { messages } from "../i18n";
import type { RoomCard } from "../room-card";
import type { HassLike, ServiceAction } from "../types";
import { RoomGrid, useRoomsEnergyToday } from "./room-grid";
import { RoomLargeCard } from "./room-large-card";

export function Rooms({
  rooms,
  hass,
  busy,
  onAction,
}: {
  rooms: RoomCard[];
  hass: HassLike;
  busy: boolean;
  onAction: (action: ServiceAction) => unknown;
}) {
  const t = messages(hass.language);
  const today = useRoomsEnergyToday(hass, rooms);
  const large = rooms.filter((room) => room.size === "large");
  const small = rooms.filter((room) => room.size === "small");
  return (
    <>
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{t.rooms}</h1>
      </header>
      {rooms.length ? (
        <>
          {large.length > 0 && (
            <div className="space-y-2">
              {large.map((room) => (
                <RoomLargeCard
                  key={room.id}
                  room={room}
                  today={today}
                  language={hass.language}
                  busy={busy}
                  onAction={onAction}
                />
              ))}
            </div>
          )}
          {small.length > 0 && (
            <section>
              {large.length > 0 && (
                <h2 className="mb-2 px-1 text-xs font-medium text-muted-foreground">
                  {t.otherRooms}
                </h2>
              )}
              <RoomGrid
                rooms={small}
                today={today}
                language={hass.language}
                busy={busy}
                onAction={onAction}
              />
            </section>
          )}
        </>
      ) : (
        <p className="text-muted-foreground">{t.noRooms}</p>
      )}
    </>
  );
}
