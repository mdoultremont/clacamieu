import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  Droplets,
  Lightbulb,
  Sun,
  Thermometer,
  Wind,
} from "lucide-react";
import { Fragment, useState } from "react";
import { messages } from "../i18n";
import type { RoomLight, RoomView } from "../room-view";
import type { ServiceAction } from "../types";
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
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";

type ActionProps = {
  busy: boolean;
  onAction: (action: ServiceAction) => Promise<boolean>;
};

export function Room({
  view,
  language,
  busy,
  onAction,
  error,
}: { view: RoomView; language: string; error: string | null } & ActionProps) {
  const t = messages(language);
  const icons = { temperature: Thermometer, humidity: Droplets, co2: Wind };
  return (
    <>
      <header className="space-y-2">
        <Button variant="ghost" className="-ml-3 min-h-11" asChild>
          <RouteLink route={{ screen: "rooms" }}>
            <ChevronLeft />
            {t.rooms}
          </RouteLink>
        </Button>
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
      {view.climate.length > 0 && (
        <ItemSection title={t.climate}>
          {view.climate.map((sensor, index) => {
            const Icon = icons[sensor.label];
            return (
              <Fragment key={sensor.label}>
                {index > 0 && <ItemSeparator />}
                <Item size="sm" role="listitem">
                  <ItemMedia className="text-muted-foreground">
                    <Icon className="size-4" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{t[sensor.label]}</ItemTitle>
                    {sensor.label === "co2" &&
                      view.air &&
                      (view.air === "poor" ? (
                        <Badge
                          variant="outline"
                          className="border-destructive/50 text-destructive"
                        >
                          {t.airQuality[view.air]}
                        </Badge>
                      ) : (
                        <ItemDescription>
                          {t.airQuality[view.air]}
                        </ItemDescription>
                      ))}
                  </ItemContent>
                  <ItemActions className="text-base font-medium tabular-nums">
                    {sensor.value}
                    {sensor.label === "temperature" ? "°" : ` ${sensor.unit}`}
                  </ItemActions>
                </Item>
              </Fragment>
            );
          })}
        </ItemSection>
      )}
      {view.lights.length > 0 && (
        <ItemSection title={t.lights}>
          {view.lights.map((light, index) => (
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
          ))}
        </ItemSection>
      )}
      {view.scenes.length > 0 && (
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
        <ItemSection title={t.sensors}>
          {view.sensors.map((sensor, index) => (
            <Fragment key={sensor.id}>
              {index > 0 && <ItemSeparator />}
              <Item size="sm" role="listitem">
                <ItemContent>
                  <ItemTitle>{sensor.name}</ItemTitle>
                  <ItemDescription>{sensor.state}</ItemDescription>
                </ItemContent>
              </Item>
            </Fragment>
          ))}
        </ItemSection>
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
