import type { RoomCard as RoomCardData } from "../room-card";
import type { ServiceAction } from "../types";
import { RoomCard } from "./room-card";

export function RoomGrid({
  rooms,
  ...props
}: {
  rooms: RoomCardData[];
  language: string;
  busy: boolean;
  onAction: (action: ServiceAction) => unknown;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {rooms.map((room) => (
        <RoomCard key={room.id} room={room} {...props} />
      ))}
    </div>
  );
}
