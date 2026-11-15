import type { RoomCard as RoomCardData } from "../room-card";
import type { HassLike, ServiceAction } from "../types";
import { useEnergyToday } from "../use-energy";
import { RoomCard } from "./room-card";

/** Today's energy for every plug in the rooms, read once for all their cards. */
export function useRoomsEnergyToday(hass: HassLike, rooms: RoomCardData[]) {
  return useEnergyToday(
    hass,
    rooms.flatMap((room) =>
      room.plugs.flatMap((plug) => (plug.energyId ? [plug.energyId] : [])),
    ),
  );
}

export function RoomGrid({
  rooms,
  today,
  language,
  busy,
  onAction,
}: {
  rooms: RoomCardData[];
  today: Record<string, number | null> | null;
  language: string;
  busy: boolean;
  onAction: (action: ServiceAction) => unknown;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {rooms.map((room) => (
        <RoomCard
          key={room.id}
          room={room}
          today={today}
          language={language}
          busy={busy}
          onAction={onAction}
        />
      ))}
    </div>
  );
}
