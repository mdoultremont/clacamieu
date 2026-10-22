import { Fragment, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Moon,
  Sprout,
  Sun,
  Wind,
} from "lucide-react";
import { buildForecastView, type GardenView } from "../garden-view";
import { messages } from "../i18n";
import type { HassLike, ServiceAction } from "../types";
import { ItemSection } from "./item-section";
import { RouteLink } from "./route-link";
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

const conditionIcons = {
  sunny: Sun,
  "clear-night": Moon,
  cloudy: Cloud,
  partlycloudy: CloudSun,
  rainy: CloudRain,
  pouring: CloudRain,
  snowy: CloudSnow,
  "snowy-rainy": CloudSnow,
  fog: CloudFog,
  hail: CloudSnow,
  lightning: CloudLightning,
  "lightning-rainy": CloudLightning,
  windy: Wind,
  "windy-variant": Wind,
};
function WeatherIcon({ state }: { state: string }) {
  const Icon = conditionIcons[state as keyof typeof conditionIcons] ?? Cloud;
  return (
    <Icon
      className="size-5 shrink-0 text-muted-foreground"
      aria-hidden="true"
    />
  );
}

export function Garden({
  hass,
  view,
  busy,
  onAction,
  error,
}: {
  hass: HassLike;
  view: GardenView;
  busy: boolean;
  onAction: (action: ServiceAction) => Promise<boolean>;
  error: string | null;
}) {
  const t = messages(hass.language);
  const [forecast, setForecast] = useState<unknown>(null);
  const [forecastError, setForecastError] = useState(false);
  const [forecastLate, setForecastLate] = useState(false);
  const weatherId = view.weather?.id;
  const daily = view.weather?.daily;
  useEffect(() => {
    setForecast(null);
    setForecastError(false);
    if (!weatherId || !daily) return;
    if (!hass.connection) {
      setForecastError(true);
      return;
    }
    let active = true;
    let unsubscribe: (() => Promise<void>) | undefined;
    setForecastLate(false);
    const late = window.setTimeout(() => {
      if (active) setForecastLate(true);
    }, 10_000);
    hass.connection
      .subscribeMessage<unknown>(
        (event) => {
          window.clearTimeout(late);
          if (active) setForecast(event);
        },
        {
          type: "weather/subscribe_forecast",
          entity_id: weatherId,
          forecast_type: "daily",
        },
      )
      .then((stop) => {
        if (active) unsubscribe = stop;
        else void stop().catch(() => {});
      })
      .catch(() => {
        if (active) setForecastError(true);
      });
    return () => {
      active = false;
      window.clearTimeout(late);
      void unsubscribe?.().catch(() => {});
    };
  }, [hass.connection, weatherId, daily]);
  const days = buildForecastView(
    forecast,
    hass.language,
    view.weather?.unit ?? "°C",
  );
  return (
    <>
      <header className="space-y-2">
        <Button variant="ghost" className="-ml-3 min-h-11" asChild>
          <RouteLink route={{ screen: "more" }}>
            <ChevronLeft />
            {t.more}
          </RouteLink>
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">{t.garden}</h1>
        {view.weather && (
          <div className="flex items-center gap-3">
            <WeatherIcon state={view.weather.state} />
            <p className="text-muted-foreground">
              {[
                view.weather.temperature,
                view.weather.condition,
                view.weather.humidity,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        )}
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {view.weather?.daily && (
        <ItemSection title={t.forecast}>
          {days.length > 0 ? (
            days.map((day, index) => (
              <Fragment key={day.date}>
                {index > 0 && <ItemSeparator />}
                <Item size="sm" role="listitem">
                  <ItemMedia>
                    <WeatherIcon state={day.state} />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle className="capitalize">{day.day}</ItemTitle>
                    <ItemDescription>{day.condition}</ItemDescription>
                  </ItemContent>
                  <ItemActions className="tabular-nums">
                    <span>{day.high ?? "·"}</span>
                    <span className="text-muted-foreground">
                      {day.low ?? "·"}
                    </span>
                  </ItemActions>
                </Item>
              </Fragment>
            ))
          ) : (
            <Item role="listitem">
              <ItemContent>
                <ItemDescription role="status">
                  {forecastError || forecastLate || forecast !== null
                    ? t.forecastError
                    : t.forecastLoading}
                </ItemDescription>
              </ItemContent>
            </Item>
          )}
        </ItemSection>
      )}
      {view.areas.length > 0 && (
        <ItemSection title={t.outdoorAreas}>
          {view.areas.map((area, index) => (
            <Fragment key={area.id}>
              {index > 0 && <ItemSeparator />}
              <div role="listitem">
                <Item size="sm" asChild>
                  <RouteLink route={{ screen: "room", areaId: area.id }}>
                    <ItemMedia className="text-muted-foreground">
                      <Sprout className="size-4" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{area.name}</ItemTitle>
                      <ItemDescription className="tabular-nums">
                        {area.climate.join(" · ")}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions className="text-muted-foreground">
                      <ChevronRight className="size-4" />
                    </ItemActions>
                  </RouteLink>
                </Item>
              </div>
            </Fragment>
          ))}
        </ItemSection>
      )}
      {view.valves.length > 0 && (
        <ItemSection title={t.irrigation}>
          {view.valves.map((valve, index) => (
            <Fragment key={valve.id}>
              {index > 0 && <ItemSeparator />}
              <Item size="sm" role="listitem">
                <ItemMedia className="text-muted-foreground">
                  <Droplets className="size-4" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{valve.name}</ItemTitle>
                  <ItemDescription>{valve.state}</ItemDescription>
                </ItemContent>
                <ItemActions className="shrink-0 flex-col sm:flex-row">
                  {valve.actions.map((action) => (
                    <Button
                      key={action.service}
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      aria-label={action.label}
                      disabled={busy || !valve.available}
                      onClick={() => onAction(action)}
                    >
                      {action.service === "open_valve" ||
                      action.service === "turn_on"
                        ? t.valveOpen
                        : t.valveClose}
                    </Button>
                  ))}
                </ItemActions>
              </Item>
            </Fragment>
          ))}
        </ItemSection>
      )}
      {!view.weather && view.areas.length === 0 && view.valves.length === 0 && (
        <p className="text-muted-foreground">{t.noClimate}</p>
      )}
    </>
  );
}
