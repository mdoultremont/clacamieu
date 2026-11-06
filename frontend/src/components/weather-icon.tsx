import {
  Cloud,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
  TriangleAlert,
  Wind,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

// Home Assistant weather condition states.
const icons: Record<string, LucideIcon> = {
  "clear-night": Moon,
  cloudy: Cloud,
  exceptional: TriangleAlert,
  fog: CloudFog,
  hail: CloudHail,
  lightning: CloudLightning,
  "lightning-rainy": CloudLightning,
  partlycloudy: CloudSun,
  pouring: CloudRainWind,
  rainy: CloudRain,
  snowy: CloudSnow,
  "snowy-rainy": CloudSnow,
  sunny: Sun,
  windy: Wind,
  "windy-variant": Wind,
};

export function WeatherIcon({
  state,
  ...props
}: { state: string } & LucideProps) {
  const Icon = icons[state] ?? Cloud;
  return <Icon aria-hidden {...props} />;
}
