"""Settings model of the Maison dashboard."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Mapping

CONF_HOME_CARDS = "home_cards"
CONF_ROOMS = "rooms"


@dataclass(frozen=True, slots=True)
class DashboardConfig:
    """Validated settings, with null lists selecting automatic configuration."""

    home_cards: list[dict[str, Any]] | None = None
    rooms: list[dict[str, Any]] | None = None

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> DashboardConfig:
        """Create settings from migrated storage or validated WebSocket data."""
        return cls(deepcopy(data.get(CONF_HOME_CARDS)), deepcopy(data.get(CONF_ROOMS)))

    def as_dict(self) -> dict[str, Any]:
        """Return an independent stored and WebSocket representation."""
        return deepcopy({CONF_HOME_CARDS: self.home_cards, CONF_ROOMS: self.rooms})
