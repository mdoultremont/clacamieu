import { Fragment, useState } from "react";
import { ChevronLeft, ChevronRight, Thermometer } from "lucide-react";
import {
  formatClimate,
  sortComfortRooms,
  type ComfortFilter,
  type ComfortView,
} from "../comfort-view";
import { messages } from "../i18n";
import { ItemSection } from "./item-section";
import { RouteLink } from "./route-link";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "./ui/item";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

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
        <Button variant="ghost" className="-ml-3 min-h-11" asChild>
          <RouteLink route={{ screen: "more" }}>
            <ChevronLeft />
            {t.more}
          </RouteLink>
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">{t.comfort}</h1>
        <p className="text-muted-foreground">
          {t.indoorAverage} ·{" "}
          {[view.temperature, view.humidity].filter(Boolean).join(" · ") ||
            t.noClimate}
        </p>
      </header>
      <ToggleGroup
        type="single"
        variant="outline"
        className="max-w-full flex-wrap"
        aria-label={t.comfortFilter}
        value={filter}
        onValueChange={(value) => {
          if (value) setFilter(value as ComfortFilter);
        }}
      >
        {filters.map(({ key, label }) => (
          <ToggleGroupItem key={key} value={key} className="min-h-11 px-2.5">
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <ItemSection title={t.rooms}>
        {sortComfortRooms(view.rooms, filter).map((room, index) => {
          const temperature = formatClimate(
            room.temperature,
            language,
            room.temperatureUnit,
          );
          const humidity = formatClimate(room.humidity, language, "%");
          const co2 = formatClimate(room.co2, language, "ppm");
          const value =
            filter === "all"
              ? temperature
              : filter === "humidity"
                ? humidity
                : filter === "co2"
                  ? co2
                  : formatClimate(room.dewPoint, language, room.dewPointUnit);
          const details =
            filter === "all"
              ? [humidity, co2]
              : [
                  temperature,
                  filter !== "humidity" ? humidity : null,
                  filter !== "co2" ? co2 : null,
                ];
          const description =
            [...details, room.perception].filter(Boolean).join(" · ") ||
            (room.temperature === null &&
            room.humidity === null &&
            room.co2 === null
              ? t.unavailable
              : "");
          return (
            <Fragment key={room.id}>
              {index > 0 && <ItemSeparator />}
              <div role="listitem">
                <Item size="sm" asChild>
                  <RouteLink route={{ screen: "room", areaId: room.id }}>
                    <ItemMedia className="text-muted-foreground">
                      <Thermometer className="size-4" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{room.name}</ItemTitle>
                      {description && (
                        <ItemDescription className="tabular-nums">
                          {description}
                        </ItemDescription>
                      )}
                      {room.problems.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {room.problems.map((problem) => (
                            <Badge
                              key={problem}
                              variant="outline"
                              className="border-destructive/50 text-destructive"
                            >
                              {problem}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </ItemContent>
                    <ItemActions className="shrink-0 text-right tabular-nums">
                      {value && <span>{value}</span>}
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </ItemActions>
                  </RouteLink>
                </Item>
              </div>
            </Fragment>
          );
        })}
        {view.rooms.length === 0 && (
          <Item role="listitem">
            <ItemContent>
              <ItemDescription>{t.noRooms}</ItemDescription>
            </ItemContent>
          </Item>
        )}
      </ItemSection>
    </>
  );
}
