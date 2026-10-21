"""Settings model of the Maison dashboard."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Mapping

CONF_ROOM_AREA_IDS = "room_area_ids"


@dataclass(frozen=True, slots=True)
class DashboardConfig:
    """User settings of the Maison dashboard.

    An empty room list shows every area, in area registry order.
    """

    room_area_ids: tuple[str, ...] = ()

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> DashboardConfig:
        """Create settings from stored or WebSocket data."""
        return cls(tuple(data.get(CONF_ROOM_AREA_IDS, ())))

    def as_dict(self) -> dict[str, Any]:
        """Return the stored and WebSocket representation."""
        return {CONF_ROOM_AREA_IDS: list(self.room_area_ids)}
