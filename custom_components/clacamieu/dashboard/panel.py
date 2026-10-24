"""Sidebar panel and static files of the Maison dashboard."""

from __future__ import annotations

import inspect
from pathlib import Path
from typing import TYPE_CHECKING

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig

from custom_components.clacamieu.const import DOMAIN

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

PANEL_URL_PATH = DOMAIN
PANEL_TITLE = "Maison"
PANEL_ICON = "mdi:home"
WEBCOMPONENT_NAME = "clacamieu-panel"
STATIC_URL_PATH = f"/{DOMAIN}_static"
DIST_PATH = Path(__file__).parent.parent / "frontend" / "dist"
_STATIC_PATH_REGISTERED = f"{DOMAIN}_static_path_registered"


async def async_register_panel(hass: HomeAssistant) -> None:
    """Serve the built frontend and add the panel to the sidebar."""
    # Home Assistant cannot unregister a static path, so a reloaded entry reuses it.
    if not hass.data.get(_STATIC_PATH_REGISTERED):
        await hass.http.async_register_static_paths(
            [StaticPathConfig(STATIC_URL_PATH, str(DIST_PATH))]
        )
        hass.data[_STATIC_PATH_REGISTERED] = True
    version = await hass.async_add_executor_job(_bundle_version)
    # Home Assistant 2026.8 pads custom panels by the safe-area insets, which
    # overflows a panel that fills the viewport and insets itself. Core 2026.9
    # added the opt-out; older cores neither pad nor accept it.
    safe_area = (
        {"handle_safe_area": True}
        if "handle_safe_area"
        in inspect.signature(panel_custom.async_register_panel).parameters
        else {}
    )
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=WEBCOMPONENT_NAME,
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        module_url=f"{STATIC_URL_PATH}/main.js?v={version}",
        require_admin=False,
        **safe_area,
    )


def async_unregister_panel(hass: HomeAssistant) -> None:
    """Remove the panel from the sidebar."""
    frontend.async_remove_panel(hass, PANEL_URL_PATH, warn_if_unknown=False)


def _bundle_version() -> int:
    """Return a module URL version that changes with every installed bundle."""
    return int((DIST_PATH / "main.js").stat().st_mtime)
