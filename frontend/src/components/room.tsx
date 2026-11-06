import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Lightbulb,
  MoveRight,
  Sun,
  TrendingDown,
  TrendingUp,
  Wind,
} from "lucide-react";
import { Fragment, useState } from "react";
import { messages } from "../i18n";
import type { RoomLight, RoomView } from "../room-view";
import type { HassLike, ServiceAction } from "../types";
import { climateTrend, type ClimateTrend } from "../climate-trend";
import { useClimateHistory } from "../use-climate-history";
import type { RoomLighting } from "../room-lighting";
import { AirMeter } from "./air-meter";
import { EntityRows } from "./entity-rows";
import { cn } from "cn";
import { ItemSection } from "./item-section";
import { BackLink } from "./back-link";
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
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";

type ActionProps = {
  busy: boolean;
  onAction: (action: ServiceAction) => Promise<boolean>;
};

export function Room({
  view,
  hass,
  lighting,
  language,
  onMoreInfo,
  busy,
  onAction,
  error,
}: {
  view: RoomView;
  hass: HassLike;
  lighting: RoomLighting | null;
  onMoreInfo: (entityId: string) => void;
  language: string;
  error: string | null;
} & ActionProps) {
  const t = messages(language);
  return (
    <>
      <header className="space-y-2">
        <BackLink fallback={{ screen: "rooms" }} language={language} />
        <h1 className="text-xl font-semibold tracking-tight">{view.name}</h1>
        <p className="text-muted-foreground">
          {[
            view.lightsOn ? t.lightsOn(view.lightsOn) : t.roomOff,
            view.air ? t.airQuality[view.air] : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {lighting && (
        <LightingHero
          name={view.name}
          lighting={lighting}
          lights={view.lights}
          language={language}
          busy={busy}
          onAction={onAction}
        />
      )}
      {view.climate.length > 0 && (
        <Climate view={view} hass={hass} />
      )}
      {!lighting && view.lights.length > 0 && (
        <ItemSection title={t.lights}>
          <LightRows
            lights={view.lights}
            language={language}
            busy={busy}
            onAction={onAction}
          />
        </ItemSection>
      )}
      {!lighting && view.scenes.length > 0 && (
        <ItemSection title={t.scenes}>
          <div role="listitem" className="p-3">
            <div className="flex w-full flex-wrap gap-2">
              {view.scenes.map((scene) => (
                <Button
                  key={scene.id}
                  variant="outline"
                  disabled={busy}
                  className="min-h-11 max-w-full h-auto whitespace-normal break-words px-4 py-2"
                  onClick={() =>
                    onAction({
                      domain: "scene",
                      service: "turn_on",
                      entityId: scene.id,
                      label: scene.name,
                    })
                  }
                >
                  {scene.name}
                </Button>
              ))}
            </div>
          </div>
        </ItemSection>
      )}
      {view.devices.length > 0 && (
        <ItemSection title={t.devices}>
          {view.devices.map((device, index) => (
            <Fragment key={device.id}>
              {index > 0 && <ItemSeparator />}
              <Item size="sm" role="listitem">
                <ItemContent>
                  <ItemTitle>{device.name}</ItemTitle>
                  <ItemDescription>{device.state}</ItemDescription>
                </ItemContent>
                <ItemActions
                  className={
                    device.actions.length === 1 ? "switch-target" : undefined
                  }
                >
                  {device.actions.length === 1 ? (
                    <Switch
                      aria-label={device.name}
                      checked={device.on}
                      disabled={busy || !device.available}
                      onCheckedChange={() => onAction(device.actions[0])}
                    />
                  ) : (
                    device.actions.map((action, i) => (
                      <Button
                        key={action.service}
                        variant="outline"
                        size="icon"
                        className="size-11"
                        aria-label={action.label}
                        disabled={busy || !device.available}
                        onClick={() => onAction(action)}
                      >
                        {i === 0 ? <ArrowUp /> : <ArrowDown />}
                      </Button>
                    ))
                  )}
                </ItemActions>
              </Item>
            </Fragment>
          ))}
        </ItemSection>
      )}
      {view.sensors.length > 0 && (
        <section className="space-y-2" aria-label={t.sensors}>
          <h2 className="px-1 text-xs font-medium text-muted-foreground">
            {t.sensors}
          </h2>
          <EntityRows
            onMoreInfo={onMoreInfo}
            rows={view.sensors.map((sensor) => ({
              id: sensor.id,
              name: sensor.name,
              value: sensor.state,
              unavailable: !sensor.available,
            }))}
          />
        </section>
      )}
    </>
  );
}

function Brightness({
  light,
  language,
  busy,
  onAction,
}: { light: RoomLight; language: string } & ActionProps) {
  const [value, setValue] = useState(light.brightness ?? 100);
  return (
    <Item size="sm" role="listitem">
      <ItemMedia className="text-muted-foreground">
        <Sun className="size-4" />
      </ItemMedia>
      <ItemContent>
        <Slider
          aria-label={messages(language).brightness(light.name)}
          className="min-h-11"
          value={[value]}
          min={1}
          max={100}
          step={1}
          disabled={busy || !light.available}
          onValueChange={([next]) => setValue(next)}
          onValueCommit={async ([next]) => {
            const done = await onAction({
              domain: "light",
              service: "turn_on",
              entityId: light.id,
              label: light.name,
              data: { brightness_pct: next },
            });
            if (!done) setValue(light.brightness ?? 100);
          }}
        />
      </ItemContent>
      <ItemActions className="w-12 justify-end tabular-nums">
        {value} %
      </ItemActions>
    </Item>
  );
}

function LightRows({
  lights,
  language,
  busy,
  onAction,
}: { lights: RoomLight[]; language: string } & ActionProps) {
  const t = messages(language);
  return lights.map((light, index) => (
    <Fragment key={light.id}>
      {index > 0 && <ItemSeparator />}
      <div role="listitem">
        <Item size="sm" asChild>
          <label className="cursor-pointer">
            <ItemMedia className="text-muted-foreground">
              <Lightbulb className="size-4" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{light.name}</ItemTitle>
              <ItemDescription className="tabular-nums">
                {!light.available
                  ? t.unavailable
                  : !light.on
                    ? t.lightOff
                    : light.brightness !== null
                      ? `${light.brightness} %`
                      : t.deviceOn}
              </ItemDescription>
            </ItemContent>
            <ItemActions className="switch-target">
              <Switch
                aria-label={light.name}
                checked={light.on}
                disabled={busy || !light.available}
                onCheckedChange={() =>
                  onAction({
                    domain: "light",
                    service: "toggle",
                    entityId: light.id,
                    label: light.name,
                  })
                }
              />
            </ItemActions>
          </label>
        </Item>
      </div>
      {light.on && light.dimmable && (
        <>
          <ItemSeparator />
          <Brightness
            key={`${light.id}-${light.brightness}`}
            light={light}
            language={language}
            busy={busy}
            onAction={onAction}
          />
        </>
      )}
    </Fragment>
  ));
}

function Climate({ view, hass }: { view: RoomView; hass: HassLike }) {
  const t = messages(hass.language);
  const history = useClimateHistory(
    hass,
    view.climate.map((sensor) => sensor.entityId),
  );
  const trend = (sensor: RoomView["climate"][number]) =>
    climateTrend(
      sensor.label,
      history[sensor.entityId],
      sensor.raw,
      hass.language,
    );
  const readings = view.climate.filter((sensor) => sensor.label !== "co2");
  const co2 = view.climate.find((sensor) => sensor.label === "co2");
  const poor = view.air === "poor";
  return (
    <section
      aria-label={t.climate}
      className="space-y-4 rounded-xl border bg-card p-4 text-card-foreground"
    >
      {readings.length > 0 && (
        <dl
          className="grid divide-x"
          style={{ gridTemplateColumns: `repeat(${readings.length}, 1fr)` }}
        >
          {readings.map((sensor) => (
            <div key={sensor.label} className="min-w-0 px-3 first:pl-0 last:pr-0">
              <dt className="truncate text-xs text-muted-foreground">
                {t[sensor.label]}
              </dt>
              <dd className="text-2xl font-semibold tracking-tight tabular-nums">
                {sensor.label === "temperature" ? (
                  `${sensor.value}°`
                ) : (
                  <>
                    {sensor.value}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      {sensor.unit}
                    </span>
                  </>
                )}
              </dd>
              <dd>
                <Trend trend={trend(sensor)} language={hass.language} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {co2 && (
        <div className={cn("space-y-2", readings.length > 0 && "border-t pt-4")}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs text-muted-foreground">{t.co2}</p>
            {view.air && (
              <p
                className={cn(
                  "text-xs",
                  poor ? "font-medium text-air-poor" : "text-muted-foreground",
                )}
              >
                {t.airQuality[view.air]}
              </p>
            )}
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <p
              className={cn(
                "text-2xl font-semibold tracking-tight tabular-nums",
                poor && "text-air-poor",
              )}
            >
              {co2.value}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                {co2.unit}
              </span>
            </p>
            <Trend trend={trend(co2)} language={hass.language} />
          </div>
          <AirMeter ppm={co2.raw} />
          <div className="flex justify-between text-[0.625rem] tabular-nums text-muted-foreground">
            <span>400</span>
            <span>800</span>
            <span>1200</span>
            <span>2000</span>
          </div>
          {poor && (
            <p className="flex items-center gap-2 rounded-lg bg-air-poor/10 px-3 py-2 text-sm text-air-poor">
              <Wind className="size-4 shrink-0" />
              {t.airOutAdvice}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function LightingHero({
  name,
  lighting,
  lights,
  language,
  busy,
  onAction,
}: {
  name: string;
  lighting: RoomLighting;
  lights: RoomLight[];
  language: string;
} & ActionProps) {
  const t = messages(language);
  const [value, setValue] = useState(lighting.brightness ?? 100);
  const [synced, setSynced] = useState(lighting.brightness);
  if (synced !== lighting.brightness) {
    setSynced(lighting.brightness);
    setValue(lighting.brightness ?? 100);
  }
  const { on } = lighting;
  return (
    <section
      aria-label={t.lights}
      className="space-y-4 rounded-xl border bg-card p-4 text-card-foreground"
    >
      <label className="flex cursor-pointer items-center gap-3">
        <span
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-lg transition-[background-color,color,box-shadow] duration-200",
            on
              ? "bg-glow text-glow-foreground shadow-[0_6px_18px_-8px_var(--glow)]"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Lightbulb className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{t.lights}</span>
          <span className="block text-sm tabular-nums text-muted-foreground">
            {!lighting.available
              ? t.unavailable
              : !on
                ? t.roomOff
                : lighting.brightness !== null
                  ? `${t.roomOn} · ${lighting.brightness} %`
                  : t.roomOn}
          </span>
        </span>
        <span className="switch-target flex items-center">
          <Switch
            aria-label={t.roomLights(name)}
            checked={on}
            disabled={busy || !lighting.available}
            onCheckedChange={() => onAction(lighting.toggle)}
          />
        </span>
      </label>
      {on && lighting.dimmable && (
        <div className="flex items-center gap-3">
          <Sun className="size-4 shrink-0 text-muted-foreground" />
          <Slider
            aria-label={t.brightness(name)}
            className="min-h-11 flex-1"
            value={[value]}
            min={1}
            max={100}
            step={1}
            disabled={busy}
            onValueChange={([next]) => setValue(next)}
            onValueCommit={async ([next]) => {
              const done = await onAction({
                domain: "light",
                service: "turn_on",
                entityId: lighting.entityId,
                label: name,
                data: { brightness_pct: next },
              });
              if (!done) setValue(lighting.brightness ?? 100);
            }}
          />
          <span className="w-10 text-right text-sm tabular-nums">
            {value} %
          </span>
        </div>
      )}
      {lighting.scenes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t.scenes}</p>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
            {lighting.scenes.map((scene) => (
              <Button
                key={scene.id}
                variant="secondary"
                disabled={busy}
                className="min-h-11 shrink-0 rounded-full px-4"
                onClick={() => onAction(scene.action)}
              >
                {scene.name}
              </Button>
            ))}
          </div>
        </div>
      )}
      {lights.length > 0 && (
        <details className="group -mx-4 -mb-4 border-t">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden">
            {t.allLights(lights.length)}
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
          </summary>
          <div role="list" aria-label={t.lights} className="border-t">
            <LightRows
              lights={lights}
              language={language}
              busy={busy}
              onAction={onAction}
            />
          </div>
        </details>
      )}
    </section>
  );
}

const trendIcons = { up: TrendingUp, down: TrendingDown, steady: MoveRight };

/** The change over the last hour, such as "↗ +0,4 in 1 h". */
function Trend({
  trend,
  language,
}: {
  trend: ClimateTrend | null;
  language: string;
}) {
  if (!trend) return null;
  const t = messages(language);
  const Icon = trendIcons[trend.direction];
  return (
    <p
      className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground"
      title={t.trendLastHour}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span>
        {trend.direction === "steady" ? t.trendSteady : trend.delta}
      </span>
      <span className="sr-only">{t.trendLastHour}</span>
    </p>
  );
}
