import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Lightbulb,
  MoveRight,
  SlidersHorizontal,
  Sun,
  TrendingDown,
  TrendingUp,
  WashingMachine,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";
import { messages } from "../i18n";
import { formatEnergy, formatWatts, runningWatts } from "../plug-power-view";
import type {
  RoomDevice,
  RoomElement,
  RoomLight,
  RoomView,
} from "../room-view";
import type {
  HassLike,
  PlugReading,
  RoomEntityConfig,
  ServiceAction,
} from "../types";
import { cycleDetail, type CycleState } from "../cycle-view";
import { useCycles } from "../use-cycles";
import { useEnergyToday } from "../use-energy";
import { climateTrend, type ClimateTrend } from "../climate-trend";
import { useClimateHistory } from "../use-climate-history";
import type { RoomLighting } from "../room-lighting";
import { AirMeter } from "./air-meter";
import { activeIcons, entityIcons } from "./entity-icon";
import { EntityRows } from "./entity-rows";
import { RoomCustomization } from "./room-customization";
import { cn } from "cn";
import { BackLink } from "./back-link";
import { Tray, trayLine } from "./tray";
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
  onCustomize,
  now,
}: {
  view: RoomView;
  hass: HassLike;
  now: Date;
  lighting: RoomLighting | null;
  onMoreInfo: (entityId: string) => void;
  language: string;
  error: string | null;
  /** Saves the room's element order and displays; absent for non-admins. */
  onCustomize?: (entities: RoomEntityConfig[]) => Promise<void>;
} & ActionProps) {
  const t = messages(language);
  const [customizing, setCustomizing] = useState(false);
  const shown = <T extends RoomElement>(elements: T[]) =>
    elements.filter((element) => element.display !== "hidden");
  const lights = shown(view.lights);
  const devices = shown(view.devices);
  const sensors = shown(view.sensors).sort(
    (a, b) => Number(b.active) - Number(a.active),
  );
  const today = useEnergyToday(
    hass,
    devices.flatMap((device) =>
      device.display === "power" && device.power?.energyId
        ? [device.power.energyId]
        : [],
    ),
  );
  const cycles = useCycles(
    hass,
    devices.flatMap((device) =>
      device.display === "cycle" && device.power
        ? [{ entityId: device.id, plug: device.power }]
        : [],
    ),
    now,
  );
  const customizable =
    view.lights.length + view.devices.length + view.sensors.length > 0;
  return (
    <>
      <header className="space-y-2">
        <BackLink fallback={{ screen: "rooms" }} language={language} />
        <div className="flex items-center justify-between gap-2">
          <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight">
            {view.name}
          </h1>
          {onCustomize && customizable && (
            <Button
              variant="ghost"
              size="icon"
              className="size-11 shrink-0 text-muted-foreground"
              aria-label={t.customizeRoom}
              title={t.customizeRoom}
              onClick={() => setCustomizing(true)}
            >
              <SlidersHorizontal />
            </Button>
          )}
        </div>
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
      {lighting ? (
        <LightingTray
          name={view.name}
          lighting={lighting}
          lights={lights}
          language={language}
          busy={busy}
          onAction={onAction}
        />
      ) : (
        <>
          {lights.length > 0 && (
            <Tray>
              <div
                role="list"
                aria-label={t.lights}
                className="tray-card overflow-hidden"
              >
                <LightRows
                  lights={lights}
                  language={language}
                  busy={busy}
                  onAction={onAction}
                />
              </div>
            </Tray>
          )}
          {view.scenes.length > 0 && (
            <Tray>
              <section aria-label={t.scenes} className="tray-card p-4">
                <SceneChips
                  scenes={view.scenes.map((scene) => ({
                    id: scene.id,
                    name: scene.name,
                    action: {
                      domain: "scene",
                      service: "turn_on",
                      entityId: scene.id,
                      label: scene.name,
                    },
                  }))}
                  busy={busy}
                  onAction={onAction}
                />
              </section>
            </Tray>
          )}
        </>
      )}
      {devices.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {devices.map((device) =>
            device.display === "cycle" && device.power ? (
              <CycleTile
                key={device.id}
                device={device}
                watts={device.power.watts}
                cycle={cycles[device.id] ?? { status: "idle" }}
                now={now}
                language={language}
                onMoreInfo={onMoreInfo}
              />
            ) : device.display === "power" && device.power ? (
              <PowerTile
                key={device.id}
                device={device}
                power={device.power}
                energy={
                  device.power.energyId && today
                    ? (today[device.power.energyId] ?? null)
                    : null
                }
                language={language}
                onMoreInfo={onMoreInfo}
              />
            ) : (
              <DeviceTile
                key={device.id}
                device={device}
                language={language}
                onMoreInfo={onMoreInfo}
                busy={busy}
                onAction={onAction}
              />
            ),
          )}
        </div>
      )}
      {view.climate.length > 0 && (
        <Tray
          alert={
            view.air === "poor" && (
              <>
                <Wind className="size-3.5 shrink-0" />
                <span className="truncate">{t.airOutAdvice}</span>
              </>
            )
          }
          info={
            [view.comfort, view.outdoor && `${t.outside} ${view.outdoor}`]
              .filter(Boolean)
              .join(" · ") || undefined
          }
        >
          <Climate view={view} hass={hass} />
        </Tray>
      )}
      {sensors.length > 0 && (
        <section className="space-y-2" aria-label={t.sensors}>
          <h2 className="px-1 text-xs font-medium text-muted-foreground">
            {t.sensors}
          </h2>
          <EntityRows
              onMoreInfo={onMoreInfo}
              rows={sensors.map((sensor) => ({
                id: sensor.id,
                name: sensor.name,
                value: sensor.state,
                detail: (sensor.available && sensor.changed) || undefined,
                icon:
                  (sensor.active && activeIcons[sensor.deviceClass]) ||
                  entityIcons[sensor.deviceClass],
                active: sensor.active,
                unavailable: !sensor.available,
              }))}
            />
        </section>
      )}
      {onCustomize && (
        <RoomCustomization
          view={view}
          language={language}
          open={customizing}
          onOpenChange={setCustomizing}
          onSave={onCustomize}
        />
      )}
    </>
  );
}

const glowBadge =
  "bg-glow text-glow-foreground shadow-[0_6px_18px_-8px_var(--glow)]";

/** A small tray whose body opens more-info and whose control sits on top. */
function Tile({
  entityId,
  name,
  description,
  badge,
  control,
  language,
  onMoreInfo,
}: {
  entityId: string;
  name: string;
  description: string;
  badge: ReactNode;
  control?: ReactNode;
  language: string;
  onMoreInfo: (entityId: string) => void;
}) {
  return (
    <Tray>
      <div className="tray-card relative flex flex-1 flex-col gap-2 p-3">
        <button
          type="button"
          aria-label={messages(language).entityDetails(name)}
          onClick={() => onMoreInfo(entityId)}
          className="absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-foreground/5"
        />
        <div className="flex min-h-11 items-center justify-between gap-2">
          {badge}
          {control && <div className="relative flex gap-1">{control}</div>}
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium">{name}</p>
          <p className="truncate text-sm tabular-nums text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
    </Tray>
  );
}

function Badge({
  icon: Icon,
  className,
}: {
  icon: LucideIcon;
  className: string;
}) {
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-lg transition-[background-color,color,box-shadow] duration-200",
        className,
      )}
    >
      <Icon className="size-[1.125rem]" />
    </span>
  );
}

function DeviceTile({
  device,
  language,
  onMoreInfo,
  busy,
  onAction,
}: {
  device: RoomDevice;
  language: string;
  onMoreInfo: (entityId: string) => void;
} & ActionProps) {
  const cover = device.domain === "cover";
  return (
    <Tile
      entityId={device.id}
      name={device.name}
      description={
        cover && device.position !== null
          ? `${device.state} · ${device.position} %`
          : device.state
      }
      badge={
        <Badge
          icon={entityIcons[device.domain]}
          className={
            device.on && !cover
              ? glowBadge
              : "bg-muted text-muted-foreground"
          }
        />
      }
      control={
        cover ? (
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
        ) : (
          <span className="switch-target flex items-center">
            <Switch
              aria-label={device.name}
              checked={device.on}
              disabled={busy || !device.available}
              onCheckedChange={() => onAction(device.actions[0])}
            />
          </span>
        )
      }
      language={language}
      onMoreInfo={onMoreInfo}
    />
  );
}

/** A plug shown as a reading: current draw and energy used today, no switch. */
function PowerTile({
  device,
  power,
  energy,
  language,
  onMoreInfo,
}: {
  device: RoomDevice;
  power: PlugReading;
  /** Energy used today in kWh, or null while loading or unknown. */
  energy: number | null;
  language: string;
  onMoreInfo: (entityId: string) => void;
}) {
  const t = messages(language);
  const { watts } = power;
  return (
    <Tile
      entityId={device.id}
      name={device.name}
      description={
        energy === null
          ? device.state
          : `${t.today} · ${formatEnergy(energy, language)}`
      }
      badge={
        <Badge
          icon={entityIcons.switch}
          className={
            (watts ?? 0) >= runningWatts
              ? glowBadge
              : "bg-muted text-muted-foreground"
          }
        />
      }
      control={
        <span className="pointer-events-none text-lg font-semibold tracking-tight tabular-nums">
          {watts === null ? "–" : formatWatts(watts, language)}
        </span>
      }
      language={language}
      onMoreInfo={onMoreInfo}
    />
  );
}

const cycleTones = {
  running: "bg-running/15 text-running",
  finished: "bg-finished/15 text-finished",
};

/** An appliance shown by its cycle: running, recently finished, or idle. */
function CycleTile({
  device,
  watts,
  cycle,
  now,
  language,
  onMoreInfo,
}: {
  device: RoomDevice;
  watts: number | null;
  cycle: CycleState;
  now: Date;
  language: string;
  onMoreInfo: (entityId: string) => void;
}) {
  const t = messages(language);
  return (
    <Tray className="col-span-2">
      <div className="tray-card relative flex items-center gap-3 p-3">
        <button
          type="button"
          aria-label={t.entityDetails(device.name)}
          onClick={() => onMoreInfo(device.id)}
          className="absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-foreground/5"
        />
        <Badge
          icon={WashingMachine}
          className={
            cycle.status === "running"
              ? glowBadge
              : "bg-muted text-muted-foreground"
          }
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{device.name}</p>
          <p className="truncate text-sm tabular-nums text-muted-foreground">
            {cycleDetail(cycle, watts, now.getTime(), language)}
          </p>
        </div>
        {cycle.status !== "idle" && (
          <span
            className={cn(
              "pointer-events-none shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
              cycleTones[cycle.status],
            )}
          >
            {cycle.status === "running" ? t.cycleRunning : t.cycleFinished}
          </span>
        )}
      </div>
    </Tray>
  );
}

function SceneChips({
  scenes,
  busy,
  onAction,
}: {
  scenes: { id: string; name: string; action: ServiceAction }[];
} & ActionProps) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
      {scenes.map((scene) => (
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
    <section aria-label={t.climate} className="tray-card space-y-4 p-4">
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
        </div>
      )}
    </section>
  );
}

function LightingTray({
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
    <Tray>
      <section aria-label={t.lights} className="tray-card space-y-4 p-4">
        <label className="flex cursor-pointer items-center gap-3">
          <span
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-lg transition-[background-color,color,box-shadow] duration-200",
              on ? glowBadge : "bg-muted text-muted-foreground",
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
          <SceneChips scenes={lighting.scenes} busy={busy} onAction={onAction} />
        )}
      </section>
      {lights.length > 0 && (
        <details className="group">
          <summary
            className={cn(
              trayLine,
              "min-h-11 cursor-pointer list-none justify-between [&::-webkit-details-marker]:hidden",
            )}
          >
            {t.allLights(lights.length)}
            <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <div
            role="list"
            aria-label={t.lights}
            className="tray-card overflow-hidden"
          >
            <LightRows
              lights={lights}
              language={language}
              busy={busy}
              onAction={onAction}
            />
          </div>
        </details>
      )}
    </Tray>
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
