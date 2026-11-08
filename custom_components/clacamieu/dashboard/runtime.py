"""Persistent settings of the Maison dashboard."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from custom_components.clacamieu.const import DOMAIN

from .models import DashboardConfig

if TYPE_CHECKING:
    from datetime import datetime

    from homeassistant.core import HomeAssistant

STORAGE_KEY = f"{DOMAIN}.dashboard"
STORAGE_VERSION = 2
CONF_CYCLE_DISMISSALS = "cycle_dismissals"


class DashboardStore(Store[dict[str, Any]]):
    """Migrate the original ordered room selection."""

    async def _async_migrate_func(
        self, old_major_version: int, old_minor_version: int, old_data: dict[str, Any]
    ) -> dict[str, Any]:
        del old_minor_version
        if old_major_version != 1:
            raise NotImplementedError
        return {
            "home_cards": None,
            "rooms": [
                {"area_id": area_id} for area_id in old_data.get("room_area_ids", [])
            ]
            or None,
        }


class DashboardRuntime:
    """Own the dashboard settings of the single dashboard config entry."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Bind the settings store."""
        self._store: Store[dict[str, Any]] = DashboardStore(
            hass, STORAGE_VERSION, STORAGE_KEY
        )
        self.config = DashboardConfig()
        self.cycle_dismissals: dict[str, str] = {}

    async def async_load(self) -> None:
        """Read saved settings, keeping the defaults when none exist."""
        if (data := await self._store.async_load()) is not None:
            self.config = DashboardConfig.from_dict(data)
            self.cycle_dismissals = dict(data.get(CONF_CYCLE_DISMISSALS, {}))

    async def async_update(self, config: DashboardConfig) -> None:
        """Replace and save the settings."""
        self.config = config
        await self._async_save()

    async def async_dismiss_cycle(self, entity_id: str, ended_at: datetime) -> None:
        """Hide a cycle appliance's finished cycle until a later one ends."""
        ended = dt_util.as_utc(ended_at)
        saved = self.cycle_dismissals.get(entity_id)
        if saved is not None and dt_util.parse_datetime(saved) >= ended:
            return
        self.cycle_dismissals[entity_id] = ended.isoformat()
        await self._async_save()

    async def _async_save(self) -> None:
        await self._store.async_save(
            {
                **self.config.as_dict(),
                CONF_CYCLE_DISMISSALS: dict(self.cycle_dismissals),
            }
        )
