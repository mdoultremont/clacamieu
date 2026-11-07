import { messages } from "../i18n";
import type { RoomCard } from "../room-card";
import type { HassLike, ServiceAction } from "../types";
import { RoomGrid } from "./room-grid";

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
  return (
    <>
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{t.rooms}</h1>
      </header>
      {rooms.length ? (
        <RoomGrid
          rooms={rooms}
          hass={hass}
          busy={busy}
          onAction={onAction}
        />
      ) : (
        <p className="text-muted-foreground">{t.noRooms}</p>
      )}
    </>
  );
}
