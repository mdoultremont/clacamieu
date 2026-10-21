import { Fragment, useId, useState } from "react";
import { Plug } from "lucide-react";
import {
  buildEnergyView,
  type EnergyBucket,
  type EnergyPeriod,
  type EnergyView,
} from "../energy-view";
import { locale, messages } from "../i18n";
import type { HassLike } from "../types";
import { useEnergy } from "../use-energy";
import { ItemSection } from "./item-section";
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

export function Energy({ hass }: { hass: HassLike }) {
  const [period, setPeriod] = useState<EnergyPeriod>("day");
  const { state, reload } = useEnergy(hass, period);
  const t = messages(hass.language);
  return (
    <>
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{t.energy}</h1>
      </header>
      <ToggleGroup
        type="single"
        variant="outline"
        value={period}
        aria-label={t.energyPeriod}
        className="w-full"
        onValueChange={(value) => {
          if (value) setPeriod(value as EnergyPeriod);
        }}
      >
        {(["day", "week", "month", "year"] as const).map((value) => (
          <ToggleGroupItem
            key={value}
            value={value}
            className="min-h-11 flex-1"
          >
            {t.energyPeriods[value]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {state.status === "loading" ? (
        <p role="status" className="px-4 text-muted-foreground">
          {t.energyLoading}
        </p>
      ) : state.status === "empty" ? (
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <p className="text-muted-foreground">{t.energyEmpty}</p>
          <Button
            variant="outline"
            className="h-auto min-h-11 whitespace-normal"
            asChild
          >
            <a href="/config/energy">{t.energySettings}</a>
          </Button>
        </div>
      ) : state.status === "error" ? (
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <p role="alert">{t.energyError}</p>
          <Button variant="outline" onClick={reload}>
            {t.retry}
          </Button>
        </div>
      ) : (
        <EnergyContent
          key={period}
          view={buildEnergyView(
            state.prefs,
            state.statistics,
            hass,
            period,
            state.now,
          )}
          language={hass.language}
          period={period}
        />
      )}
    </>
  );
}

function EnergyContent({
  view,
  language,
  period,
}: {
  view: EnergyView;
  language: string;
  period: EnergyPeriod;
}) {
  const t = messages(language);
  const number = (value: number, digits = 2) =>
    new Intl.NumberFormat(locale(language), {
      maximumFractionDigits: digits,
    }).format(value);
  const energy = (value: number | null) =>
    value === null ? t.energyNoData : `${number(value)} kWh`;
  const money = (value: number) =>
    new Intl.NumberFormat(locale(language), {
      style: "currency",
      currency: "EUR",
    }).format(value);
  const change =
    view.change === null
      ? "—"
      : `${new Intl.NumberFormat(locale(language), { maximumFractionDigits: 1, signDisplay: "always" }).format(view.change)} %`;
  const cards = [
    {
      label: t.energyNow,
      value:
        view.watts === null ? "—" : `${number(view.watts, 0)} W`,
      detail: t.plugPower,
    },
    {
      label: t.energyPeriodTotals[period],
      value: view.kwh === null ? "—" : energy(view.kwh),
      detail: view.cost === null ? null : money(view.cost),
    },
    { label: t.energyComparison, value: change, detail: t.energyPrevious },
  ];
  return (
    <>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map((card, index) => (
          <div
            key={card.label}
            className={`flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-4 text-card-foreground ${index === 2 ? "col-span-2 sm:col-span-1 text-muted-foreground" : ""}`}
          >
            <h2 className="text-muted-foreground">{card.label}</h2>
            <p
              aria-label={card.value === "—" ? t.energyNoData : undefined}
              className="break-words text-2xl font-semibold tabular-nums"
            >
              {card.value}
            </p>
            {card.detail && (
              <p className="text-xs text-muted-foreground">{card.detail}</p>
            )}
          </div>
        ))}
      </section>
      <ConsumptionChart
        buckets={view.buckets}
        summary={t.energyChartSummary(energy(view.kwh))}
        language={language}
      />
      {view.configured && view.source === "devices" && (
        <p className="px-4 text-xs text-muted-foreground">
          {t.energyDevicesOnly}
        </p>
      )}
      {view.partial && (
        <p className="px-4 text-xs text-muted-foreground">{t.energyPartial}</p>
      )}
      <ItemSection title={t.devices}>
        {view.devices.length ? (
          view.devices.map((device, index) => (
            <Fragment key={device.id}>
              {index > 0 && <ItemSeparator />}
              <Item role="listitem" size="sm">
                <ItemMedia className="text-muted-foreground">
                  <Plug className="size-4" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{device.name}</ItemTitle>
                  <ItemDescription className="tabular-nums">
                    {energy(device.kwh)}
                    {device.share !== null && ` · ${number(device.share, 1)} %`}
                  </ItemDescription>
                </ItemContent>
                {(device.watts !== null || device.cost !== null) && (
                  <ItemActions className="shrink-0 flex-col items-end gap-0 tabular-nums">
                    {device.watts !== null && (
                      <span>{number(device.watts, 0)} W</span>
                    )}
                    {device.cost !== null && (
                      <span className="text-xs text-muted-foreground">
                        {money(device.cost)}
                      </span>
                    )}
                  </ItemActions>
                )}
              </Item>
            </Fragment>
          ))
        ) : (
          <Item>
            <ItemContent>
              <ItemDescription>{t.energyNoDevices}</ItemDescription>
            </ItemContent>
          </Item>
        )}
      </ItemSection>
    </>
  );
}

export function ConsumptionChart({
  buckets,
  summary,
  language,
}: {
  buckets: EnergyBucket[];
  summary: string;
  language: string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const id = useId();
  const t = messages(language);
  const number = (value: number) =>
    new Intl.NumberFormat(locale(language), {
      maximumFractionDigits: 2,
    }).format(value);
  const maximum = Math.max(...buckets.map((bucket) => bucket.kwh ?? 0), 0.1);
  const ceiling = Math.ceil(maximum * 10) / 10;
  const hasData = buckets.some((bucket) => bucket.kwh !== null);
  const width = 360;
  const left = 42;
  const plotWidth = width - left - 4;
  const plotHeight = 144;
  const step = plotWidth / buckets.length;
  const selectedBucket = selected === null ? null : buckets[selected];
  const value = (bucket: EnergyBucket) =>
    `${bucket.description} · ${bucket.kwh === null ? t.energyNoData : `${number(bucket.kwh)} kWh`}`;
  return (
    <section
      aria-labelledby={id}
      className="space-y-3 rounded-xl border bg-card p-4 text-card-foreground"
    >
      <h2 id={id} className="font-medium">
        {t.energyConsumption}
      </h2>
      <svg
        viewBox={`0 0 ${width} 192`}
        className="h-48 w-full overflow-visible tabular-nums"
        role="group"
        aria-label={summary}
      >
        {[0, 0.5, 1].map((ratio) => (
          <g key={ratio} className="text-muted-foreground">
            <line
              x1={left}
              x2={width}
              y1={12 + plotHeight * ratio}
              y2={12 + plotHeight * ratio}
              stroke="currentColor"
              opacity="0.15"
            />
            <text
              x={left - 7}
              y={16 + plotHeight * ratio}
              textAnchor="end"
              fill="currentColor"
              fontSize="10"
            >
              {hasData ? number(ceiling * (1 - ratio)) : ratio === 1 ? "0" : ""}
            </text>
          </g>
        ))}
        {!hasData && (
          <text
            x="201"
            y="74"
            textAnchor="middle"
            fill="currentColor"
            fontSize="12"
            className="text-muted-foreground"
          >
            {t.energyNoData}
          </text>
        )}
        <text
          x="0"
          y="185"
          fill="currentColor"
          fontSize="10"
          className="text-muted-foreground"
        >
          kWh
        </text>
        {buckets.map((bucket, index) => {
          const height =
            bucket.kwh === null ? 0 : (bucket.kwh / ceiling) * plotHeight;
          const x = left + index * step;
          const showLabel =
            index === 0 ||
            index === buckets.length - 1 ||
            index % Math.ceil(buckets.length / 5) === 0;
          return (
            <g
              key={bucket.start}
              role="button"
              tabIndex={0}
              aria-label={value(bucket)}
              aria-pressed={selected === index}
              className={`cursor-pointer outline-none focus-visible:stroke-foreground ${bucket.current ? "text-foreground" : "text-muted-foreground"}`}
              onClick={() => setSelected(index)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelected(index);
                }
              }}
            >
              <title>{value(bucket)}</title>
              <rect
                x={x}
                y="8"
                width={step}
                height={plotHeight + 8}
                fill="transparent"
              />
              <rect
                x={x + Math.min(step * 0.15, 3)}
                y={
                  12 +
                  plotHeight -
                  Math.max(height, bucket.kwh === null ? 0 : 1)
                }
                width={step * 0.7}
                height={Math.max(height, bucket.kwh === null ? 0 : 1)}
                rx="1.5"
                fill="currentColor"
                opacity={bucket.current || selected === index ? 1 : 0.45}
              />
              {selected === index && (
                <line
                  x1={x + step * 0.15}
                  x2={x + step * 0.85}
                  y1="161"
                  y2="161"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              )}
              {showLabel && (
                <text
                  x={x + step / 2}
                  y="181"
                  textAnchor="middle"
                  fill="currentColor"
                  stroke="none"
                  fontSize="10"
                >
                  {bucket.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p
        aria-live="polite"
        className="min-h-5 text-xs text-muted-foreground tabular-nums"
      >
        {selectedBucket ? value(selectedBucket) : t.energySelectBar}
      </p>
    </section>
  );
}
