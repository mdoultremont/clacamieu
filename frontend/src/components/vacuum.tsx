import { ChevronLeft, Home, MapPin, Pause, Play, Search } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { messages } from "../i18n";
import {
  buildVacuumView,
  type ServiceCatalog,
  type VacuumView,
} from "../vacuum-view";
import type { DashboardConfig, HassLike, ServiceAction } from "../types";
import { ItemSection } from "./item-section";
import { RouteLink } from "./route-link";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemSeparator,
  ItemTitle,
} from "./ui/item";

export function Vacuum({
  hass,
  config,
  busy,
  onAction,
  error,
  onMoreInfo,
}: {
  hass: HassLike;
  config: DashboardConfig;
  busy: boolean;
  onAction: (action: ServiceAction) => Promise<boolean>;
  error: string | null;
  onMoreInfo: (entityId: string) => void;
}) {
  const t = messages(hass.language);
  const [services, setServices] = useState<ServiceCatalog>({});
  const [servicesError, setServicesError] = useState(false);
  useEffect(() => {
    let current = true;
    hass
      .callWS<ServiceCatalog>({ type: "get_services" })
      .then((value) => {
        if (current) setServices(value);
      })
      .catch(() => {
        if (current) setServicesError(true);
      });
    return () => {
      current = false;
    };
  }, [hass.callWS]);
  const view = buildVacuumView(hass, config, services);
  const icons = {
    start: Play,
    pause: Pause,
    return_to_base: Home,
    locate: Search,
  };
  return (
    <>
      <header className="space-y-2">
        <Button variant="ghost" className="-ml-3 min-h-11" asChild>
          <RouteLink route={{ screen: "more" }}>
            <ChevronLeft />
            {t.more}
          </RouteLink>
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">{t.vacuumPage}</h1>
        {view && (
          <p className="text-muted-foreground">
            {[view.state, view.battery, view.currentRoom]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {servicesError && (
        <p className="error" role="alert">
          {t.vacuumServicesError}
        </p>
      )}
      {!view ? (
        <p className="text-muted-foreground">{t.noVacuum}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2" aria-label={view.name}>
            {view.actions.map((action) => {
              const Icon = icons[action.service];
              return (
                <Button
                  key={action.service}
                  variant="outline"
                  className="h-auto min-h-11 whitespace-normal py-3"
                  disabled={busy || !view.available}
                  onClick={() => onAction(action)}
                >
                  {Icon && <Icon />}
                  {action.label}
                </Button>
              );
            })}
          </div>
          {view.camera && (
            <VacuumMap
              key={view.camera.id}
              camera={view.camera}
              language={hass.language}
              onMoreInfo={onMoreInfo}
            />
          )}
          {view.rooms.length > 0 && (
            <ItemSection title={t.roomCleaning}>
              {view.rooms.map((room, index) => (
                <Fragment key={room.id}>
                  {index > 0 && <ItemSeparator />}
                  <Item size="sm" role="listitem">
                    <ItemContent>
                      <ItemTitle>{room.name}</ItemTitle>
                    </ItemContent>
                    <ItemActions>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-11"
                        aria-label={room.action.label}
                        disabled={busy || !view.available}
                        onClick={() => onAction(room.action)}
                      >
                        <Play />
                      </Button>
                    </ItemActions>
                  </Item>
                </Fragment>
              ))}
            </ItemSection>
          )}
          {view.statistics.length > 0 && (
            <ItemSection title={t.statistics}>
              {view.statistics.map((stat, index) => (
                <Fragment key={stat.id}>
                  {index > 0 && <ItemSeparator />}
                  <Item size="sm" role="listitem">
                    <ItemContent>
                      <ItemTitle>{stat.name}</ItemTitle>
                    </ItemContent>
                    <ItemActions className="tabular-nums">
                      {stat.value}
                    </ItemActions>
                  </Item>
                </Fragment>
              ))}
            </ItemSection>
          )}
          {view.consumables.length > 0 && (
            <ItemSection title={t.consumables}>
              {view.consumables.map((item, index) => (
                <Fragment key={item.id}>
                  {index > 0 && <ItemSeparator />}
                  <Item size="sm" role="listitem">
                    <ItemContent>
                      <ItemTitle>{item.name}</ItemTitle>
                    </ItemContent>
                    <ItemActions className="tabular-nums">
                      {item.low ? (
                        <Badge
                          variant="outline"
                          className="border-destructive/50 text-destructive"
                        >
                          {item.value}
                        </Badge>
                      ) : (
                        item.value
                      )}
                    </ItemActions>
                  </Item>
                </Fragment>
              ))}
            </ItemSection>
          )}
        </>
      )}
    </>
  );
}

function VacuumMap({
  camera,
  language,
  onMoreInfo,
}: {
  camera: NonNullable<VacuumView["camera"]>;
  language: string;
  onMoreInfo: (id: string) => void;
}) {
  const t = messages(language);
  const ref = useRef<HTMLButtonElement>(null);
  const [stamp, setStamp] = useState(Date.now());
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let visible = false;
    let timer: number | undefined;
    const refresh = () => {
      setFailed(false);
      setStamp(Date.now());
    };
    const schedule = () => {
      window.clearInterval(timer);
      if (visible && document.visibilityState === "visible") {
        refresh();
        timer = window.setInterval(refresh, 10_000);
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      schedule();
    });
    observer.observe(element);
    document.addEventListener("visibilitychange", schedule);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [camera.id]);
  const picture = camera.picture
    ? `${camera.picture}${camera.picture.includes("?") ? "&" : "?"}_maison=${stamp}`
    : null;
  return (
    <ItemSection title={t.vacuumMap}>
      <button
        ref={ref}
        type="button"
        className="relative flex min-h-40 w-full items-center justify-center bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring"
        onClick={() => onMoreInfo(camera.id)}
        aria-label={t.vacuumMap}
      >
        {picture && !failed ? (
          <img
            src={picture}
            alt={t.vacuumMap}
            className="max-h-80 w-full object-contain"
            onError={() => setFailed(true)}
          />
        ) : (
          <span className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <MapPin className="size-4 shrink-0" />
            {t.vacuumMapUnavailable}
          </span>
        )}
      </button>
    </ItemSection>
  );
}
