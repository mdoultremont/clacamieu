import type { RoomCard as RoomCardData } from "../room-card";
import type { HassLike, ServiceAction } from "../types";
import { useEnergyToday } from "../use-energy";
import { RoomCard } from "./room-card";

export function RoomGrid({
  rooms,
  hass,
  busy,
  onAction,
}: {
  rooms: RoomCardData[];
  hass: HassLike;
  busy: boolean;
  onAction: (action: ServiceAction) => unknown;
}) {
  const today = useEnergyToday(
    hass,
    rooms.flatMap((room) =>
      room.plugs.flatMap((plug) => (plug.energyId ? [plug.energyId] : [])),
    ),
  );
  return (
    <div className="grid grid-cols-2 gap-2">
      {rooms.map((room) => (
        <RoomCard
          key={room.id}
          room={room}
          today={today}
          language={hass.language}
          busy={busy}
          onAction={onAction}
        />
      ))}
    </div>
  );
}
