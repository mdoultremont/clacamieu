import { cn } from "cn";

type Level = "good" | "fair" | "poor";
const levelClass: Record<Level, string> = {
  good: "bg-air-good",
  fair: "bg-air-fair",
  poor: "bg-air-poor",
};

export interface MeterScale {
  min: number;
  max: number;
  zones: { until: number; level: Level }[];
}

export const co2Scale: MeterScale = {
  min: 400,
  max: 2000,
  zones: [
    { until: 800, level: "good" },
    { until: 1200, level: "fair" },
    { until: 2000, level: "poor" },
  ],
};

export const humidityScale: MeterScale = {
  min: 20,
  max: 90,
  zones: [
    { until: 40, level: "fair" },
    { until: 60, level: "good" },
    { until: 70, level: "fair" },
    { until: 90, level: "poor" },
  ],
};

export function Meter({
  value,
  scale,
  className,
}: {
  value: number;
  scale: MeterScale;
  className?: string;
}) {
  const span = scale.max - scale.min;
  const position = Math.min(1, Math.max(0, (value - scale.min) / span));
  // The zone holding the value is shown at full color, the others faded.
  const active =
    scale.zones.find((zone) => value < zone.until) ?? scale.zones.at(-1);
  let start = scale.min;
  return (
    <div className={cn("relative h-1.5", className)} aria-hidden>
      <div className="flex h-full gap-0.5 overflow-hidden rounded-full">
        {scale.zones.map((zone) => {
          const width = (zone.until - start) / span;
          start = zone.until;
          return (
            <div
              key={zone.until}
              className={cn(
                "h-full transition-opacity",
                zone === active ? "opacity-100" : "opacity-30",
                levelClass[zone.level],
              )}
              style={{ flexGrow: width }}
            />
          );
        })}
      </div>
      <div
        className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-foreground shadow-sm"
        style={{ left: `${position * 100}%` }}
      />
    </div>
  );
}

export function AirMeter({
  ppm,
  className,
}: {
  ppm: number;
  className?: string;
}) {
  return <Meter value={ppm} scale={co2Scale} className={className} />;
}
