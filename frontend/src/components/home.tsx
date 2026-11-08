import { WeatherIcon } from "./weather-icon";
import { Fragment, useId, type ReactNode } from "react";
import { messages } from "../i18n";
import type {
  HassLike,
  HomeView,
  HomeCardView,
  ServiceAction,
} from "../types";
import { ItemSection } from "./item-section";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemSeparator,
  ItemTitle,
} from "./ui/item";
import { Switch } from "./ui/switch";
import { AlarmCard, PowerCard, VacuumCard } from "./home-status";
import { CycleIslands } from "./cycle-island";
import { buildCycleChips } from "../cycle-view";
import { useCycleDismissals, useCycles } from "../use-cycles";
import type { SecurityView } from "../security-view";
import type { VacuumView } from "../vacuum-view";
import { RoomGrid } from "./room-grid";
import { hasHomeContent } from "../room-card";
import { cn } from "cn";

type ActionProps = {
  language: string;
  onAction: (action: ServiceAction) => void;
  busy: boolean;
};

type StatusProps = {
  hass: HassLike;
  security: SecurityView;
  vacuum: VacuumView | null;
};

export function Home({
  view,
  now,
  ...props
}: { view: HomeView; now: Date } & ActionProps & StatusProps) {
  const t = messages(props.language);
  const cycles = useCycles(props.hass, view.cycleAppliances, now);
  const { dismissed, dismiss } = useCycleDismissals(props.hass);
  return (
    <>
      <header className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">{t.home}</h1>
          <p className="text-muted-foreground">{view.date}</p>
        </div>
        {view.weather && (
          <div className="shrink-0 text-right" aria-label={t.outside}>
            <p className="flex items-center justify-end gap-1.5 text-xl font-semibold tabular-nums">
              <WeatherIcon
                state={view.weather.state}
                className="size-5 text-muted-foreground"
              />
              {view.weather.temperature != null
                ? `${view.weather.temperature}°`
                : "—"}
            </p>
            <p className="text-muted-foreground">{view.weather.condition}</p>
          </div>
        )}
      </div>
        <CycleIslands
          chips={buildCycleChips(
            view.cycleAppliances,
            cycles,
            dismissed,
            now.getTime(),
            props.language,
          )}
          now={now}
          language={props.language}
          onDismiss={dismiss}
        />
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
  hass,
  security,
  vacuum,
}: { view: HomeCardView } & ActionProps & StatusProps) {
  const id = useId();
  switch (view.type) {
    case "alarm":
      return (
        <AlarmCard
          summary={view.alarm}
          security={security}
          language={language}
        />
      );
    case "vacuum":
      return (
        <VacuumCard summary={view.vacuum} vacuum={vacuum} language={language} />
      );
    case "power":
      return <PowerCard power={view.plugPower} hass={hass} />;
    case "rooms":
      return (
        <RoomsSection
          view={view}
          hass={hass}
          busy={busy}
          onAction={onAction}
        />
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

function RoomsSection({
  view,
  hass,
  busy,
  onAction,
}: { view: Extract<HomeCardView, { type: "rooms" }>; hass: HassLike } & Omit<
  ActionProps,
  "language"
>) {
  const t = messages(hass.language);
  // Automatic selection skips rooms with nothing to show; favorites are explicit.
  const rooms = view.areaIds ? view.rooms : view.rooms.filter(hasHomeContent);
  const toAirOut = rooms.filter((room) => room.co2?.level === "poor").length;
  if (!rooms.length) return null;
  return (
    <Section
      title={t.rooms}
      description={
        toAirOut ? t.roomsToAirOut(toAirOut) : t.lightsOn(view.lightsOn)
      }
      alert={toAirOut > 0}
    >
      <RoomGrid rooms={rooms} hass={hass} busy={busy} onAction={onAction} />
    </Section>
  );
}

function Section({
  title,
  description,
  alert,
  children,
}: {
  title: string;
  description?: string;
  alert?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 px-1 text-xs text-muted-foreground">
        <h2 id={id} className="font-medium">
          {title}
        </h2>
        {description && (
          <p className={cn("text-right", alert && "font-medium text-air-poor")}>
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}
