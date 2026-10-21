import { Bot, DoorOpen, Plug, Shield, Users } from "lucide-react";
import { Fragment, useId } from "react";
import { messages } from "../i18n";
import type { HomeView, HomeCardView, ServiceAction } from "../types";
import { ItemSection } from "./item-section";
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
import { Switch } from "./ui/switch";

type ActionProps = {
  language: string;
  onAction: (action: ServiceAction) => void;
  busy: boolean;
};

export function Home({ view, ...props }: { view: HomeView } & ActionProps) {
  const t = messages(props.language);
  return (
    <>
      <header className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">{t.home}</h1>
        <p className="text-muted-foreground">{view.date}</p>
      </header>
      {view.cards.map((card) => (
        <HomeCard key={card.id} view={card} {...props} />
      ))}
    </>
  );
}

function HomeCard({
  view,
  language,
  onAction,
  busy,
}: { view: HomeCardView } & ActionProps) {
  const t = messages(language);
  const id = useId();
  switch (view.type) {
    case "summary":
      return (
        <section className="grid grid-cols-2 gap-3">
          <div className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-4 text-card-foreground">
            <p className="text-muted-foreground">{t.inside}</p>
            <p className="text-2xl font-semibold tabular-nums">
              {view.indoorTemperature !== null
                ? `${view.indoorTemperature}°`
                : "—"}
            </p>
            <p className="text-muted-foreground">
              {view.indoorSensorCount
                ? t.averageRooms(view.indoorSensorCount)
                : t.noClimate}
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-4 text-card-foreground">
            <p className="text-muted-foreground">{t.outside}</p>
            <p className="text-2xl font-semibold tabular-nums">
              {view.weather?.temperature != null
                ? `${view.weather.temperature}°`
                : "—"}
            </p>
            <p className="text-muted-foreground">
              {view.weather?.condition ?? t.weather.unavailable}
            </p>
          </div>
        </section>
      );
    case "presence": {
      const people = view.people.filter((person) => person.home);
      return (
        <ItemSection title={t.atHome}>
          <Item role="listitem" size="sm">
            <ItemMedia className="text-muted-foreground">
              <Users className="size-4" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>
                {people.map((person) => person.name).join(", ") || t.nobodyHome}
              </ItemTitle>
            </ItemContent>
            {people.length > 0 && (
              <ItemActions className="text-base font-medium tabular-nums">
                {people.length}
              </ItemActions>
            )}
          </Item>
        </ItemSection>
      );
    }
    case "alarm":
      return (
        <ItemSection title={t.alarmLabel}>
          <Item role="listitem" size="sm">
            <ItemMedia className="text-muted-foreground">
              <Shield className="size-4" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{view.alarm.title}</ItemTitle>
            </ItemContent>
            {view.alarm.action && (
              <ItemActions>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    view.alarm.action && onAction(view.alarm.action)
                  }
                >
                  {view.alarm.action.label}
                </Button>
              </ItemActions>
            )}
          </Item>
          <ItemSeparator />
          <Item role="listitem" size="sm">
            <ItemMedia className="text-muted-foreground">
              <DoorOpen className="size-4" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{t.openingsLeaks}</ItemTitle>
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                {view.alarm.safety.length
                  ? view.alarm.safety.map((sensor) =>
                      sensor.alert ? (
                        <Badge
                          key={sensor.text}
                          variant="outline"
                          className="border-destructive/50 text-destructive"
                        >
                          {sensor.text}
                        </Badge>
                      ) : (
                        <span key={sensor.text}>{sensor.text}</span>
                      ),
                    )
                  : t.noSafetySensors}
              </div>
            </ItemContent>
          </Item>
        </ItemSection>
      );
    case "vacuum":
      return (
        <ItemSection title={view.vacuum.name}>
          <Item role="listitem" size="sm">
            <ItemMedia className="text-muted-foreground">
              <Bot className="size-4" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{view.vacuum.state}</ItemTitle>
              {view.vacuum.battery !== null && (
                <ItemDescription className="tabular-nums">
                  {t.battery(view.vacuum.battery)}
                </ItemDescription>
              )}
            </ItemContent>
            {view.vacuum.action && (
              <ItemActions>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    view.vacuum.action && onAction(view.vacuum.action)
                  }
                >
                  {view.vacuum.action.label}
                </Button>
              </ItemActions>
            )}
          </Item>
        </ItemSection>
      );
    case "power":
      return (
        <ItemSection title={t.plugs}>
          <Item role="listitem" size="sm">
            <ItemMedia className="text-muted-foreground">
              <Plug className="size-4" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{t.plugPower}</ItemTitle>
              {view.plugPower.topConsumer && (
                <ItemDescription className="tabular-nums">
                  {view.plugPower.topConsumer}
                </ItemDescription>
              )}
            </ItemContent>
            <ItemActions className="text-base font-medium tabular-nums">
              {view.plugPower.total === t.unavailable
                ? t.unavailable
                : `${view.plugPower.total} W`}
            </ItemActions>
          </Item>
        </ItemSection>
      );
    case "rooms":
      return (
        <ItemSection title={t.rooms} description={t.lightsOn(view.lightsOn)}>
          {view.rooms.map((room, index) => {
            const description =
              [
                room.humidity !== null ? `${room.humidity} %` : null,
                room.co2 !== null ? `${room.co2} ppm` : null,
              ]
                .filter(Boolean)
                .join(" · ") ||
              (room.temperature === null ? t.noClimate : "");
            return (
              <Fragment key={room.id}>
                {index > 0 && <ItemSeparator />}
                <Item role="listitem" size="sm">
                  <ItemContent>
                    <ItemTitle>{room.name}</ItemTitle>
                    {description && (
                      <ItemDescription className="tabular-nums">
                        {description}
                      </ItemDescription>
                    )}
                  </ItemContent>
                  {room.temperature !== null && (
                    <ItemActions className="text-base font-medium tabular-nums">
                      {room.temperature}°
                    </ItemActions>
                  )}
                </Item>
              </Fragment>
            );
          })}
          {!view.rooms.length && (
            <Item role="listitem" size="sm">
              <ItemDescription>{t.noRooms}</ItemDescription>
            </Item>
          )}
        </ItemSection>
      );
    case "entities":
      return (
        <ItemSection title={view.title}>
          {view.entities.map((entity, index) => (
            <Fragment key={`${entity.id}-${index}`}>
              {index > 0 && <ItemSeparator />}
              <Item role="listitem" size="sm" asChild={!!entity.action}>
                {entity.action ? (
                  <label htmlFor={`${id}-${index}`} className="cursor-pointer">
                    <ItemContent>
                      <ItemTitle>{entity.name}</ItemTitle>
                      <ItemDescription className="tabular-nums">
                        {entity.state}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions className="switch-target">
                      <Switch
                        id={`${id}-${index}`}
                        aria-label={entity.name}
                        checked={entity.on}
                        disabled={busy || !entity.available}
                        onCheckedChange={() =>
                          entity.action && onAction(entity.action)
                        }
                      />
                    </ItemActions>
                  </label>
                ) : (
                  <>
                    <ItemContent>
                      <ItemTitle>{entity.name}</ItemTitle>
                      <ItemDescription className="tabular-nums">
                        {entity.state}
                      </ItemDescription>
                    </ItemContent>
                  </>
                )}
              </Item>
            </Fragment>
          ))}
        </ItemSection>
      );
  }
}
