import { messages } from "../i18n";
import type { RoomCard } from "../room-card";
import type { ServiceAction } from "../types";
import { RoomGrid } from "./room-grid";

export function Rooms({
  rooms,
  language,
  busy,
  onAction,
}: {
  rooms: RoomCard[];
  language: string;
  busy: boolean;
  onAction: (action: ServiceAction) => unknown;
}) {
  const t = messages(language);
  return (
    <>
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{t.rooms}</h1>
      </header>
      {rooms.length ? (
        <RoomGrid
          rooms={rooms}
          language={language}
          busy={busy}
          onAction={onAction}
        />
      ) : (
        <p className="text-muted-foreground">{t.noRooms}</p>
      )}
    </>
  );
}
