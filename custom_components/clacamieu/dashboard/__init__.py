"""Maison dashboard panel served by Clacamieu."""

from __future__ import annotations

from typing import TYPE_CHECKING

from .panel import async_register_panel, async_unregister_panel
from .runtime import DashboardRuntime
from .websocket import async_register_commands

if TYPE_CHECKING:
    from homeassistant.config_entries import ConfigEntry
    from homeassistant.core import HomeAssistant


async def async_setup_dashboard_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Load the dashboard settings and add the Maison panel to the sidebar."""
    runtime = DashboardRuntime(hass)
    await runtime.async_load()
    entry.runtime_data = runtime
    async_register_commands(hass)
    await async_register_panel(hass)
    return True


def async_unload_dashboard_entry(hass: HomeAssistant) -> None:
    """Remove the Maison panel from the sidebar."""
    async_unregister_panel(hass)
