import type { HassLike } from "./types";

export type CorePreferences = Record<string, unknown>;

export async function readPreferences(
  hass: HassLike,
): Promise<CorePreferences> {
  const result = await hass.callWS<{ value?: CorePreferences | null }>({
    type: "frontend/get_user_data",
    key: "core",
  });
  return result.value ?? {};
}

export async function setDefaultPanel(
  hass: HassLike,
  panelPath: string,
  enabled: boolean,
): Promise<CorePreferences> {
  const previous = await readPreferences(hass);
  const next = { ...previous };
  if (enabled) next.default_panel = panelPath;
  else delete next.default_panel;
  await hass.callWS({
    type: "frontend/set_user_data",
    key: "core",
    value: next,
  });
  return next;
}
