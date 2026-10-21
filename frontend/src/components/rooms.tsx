import { ChevronRight } from "lucide-react";
import { Fragment } from "react";
import { messages } from "../i18n";
import type { RoomView } from "../room-view";
import { ItemSection } from "./item-section";
import { RouteLink } from "./route-link";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemSeparator,
  ItemTitle,
} from "./ui/item";

export function Rooms({
  rooms,
  language,
}: {
  rooms: RoomView[];
  language: string;
}) {
  const t = messages(language);
  return (
    <>
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{t.rooms}</h1>
      </header>
      <ItemSection label={t.rooms}>
        {rooms.map((room, index) => {
          const temperature = room.climate.find(
            (sensor) => sensor.label === "temperature",
          );
          return (
            <Fragment key={room.id}>
              {index > 0 && <ItemSeparator />}
              <div role="listitem">
                <Item size="sm" asChild>
                  <RouteLink route={{ screen: "room", areaId: room.id }}>
                    <ItemContent>
                      <ItemTitle>{room.name}</ItemTitle>
                      <ItemDescription className="tabular-nums">
                        {[
                          room.lightsOn ? t.lightsOn(room.lightsOn) : t.roomOff,
                          ...room.climate
                            .filter((sensor) => sensor.label !== "temperature")
                            .map((sensor) => `${sensor.value} ${sensor.unit}`),
                        ].join(" · ")}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions className="text-base font-medium tabular-nums">
                      {temperature && `${temperature.value}°`}
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </ItemActions>
                  </RouteLink>
                </Item>
              </div>
            </Fragment>
          );
        })}
        {!rooms.length && (
          <Item size="sm" role="listitem">
            <ItemDescription>{t.noRooms}</ItemDescription>
          </Item>
        )}
      </ItemSection>
    </>
  );
}
