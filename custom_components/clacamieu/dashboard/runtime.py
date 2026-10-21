"""Persistent settings of the Maison dashboard."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from homeassistant.helpers.storage import Store

from custom_components.clacamieu.const import DOMAIN

from .models import DashboardConfig

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

STORAGE_KEY = f"{DOMAIN}.dashboard"
STORAGE_VERSION = 1


class DashboardRuntime:
    """Own the dashboard settings of the single dashboard config entry."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Bind the settings store."""
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.config = DashboardConfig()

    async def async_load(self) -> None:
        """Read saved settings, keeping the defaults when none exist."""
        if (data := await self._store.async_load()) is not None:
            self.config = DashboardConfig.from_dict(data)

    async def async_update(self, config: DashboardConfig) -> None:
        """Replace and save the settings."""
        self.config = config
        await self._store.async_save(config.as_dict())
