"""Settings model of the Maison dashboard."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Mapping

CONF_HOME_CARDS = "home_cards"
CONF_ROOMS = "rooms"
CONF_SECURITY = "security"
CONF_VACUUM = "vacuum"


@dataclass(frozen=True, slots=True)
class DashboardConfig:
    """Validated settings, with null lists selecting automatic configuration."""

    home_cards: list[dict[str, Any]] | None = None
    rooms: list[dict[str, Any]] | None = None
    security: dict[str, Any] | None = None
    vacuum: dict[str, Any] | None = None

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> DashboardConfig:
        """Create settings from migrated storage or validated WebSocket data."""
        return cls(
            *(
                deepcopy(data.get(key))
                for key in (CONF_HOME_CARDS, CONF_ROOMS, CONF_SECURITY, CONF_VACUUM)
            )
        )

    def as_dict(self) -> dict[str, Any]:
        """Return an independent stored and WebSocket representation."""
        return deepcopy(
            {
                CONF_HOME_CARDS: self.home_cards,
                CONF_ROOMS: self.rooms,
                CONF_SECURITY: self.security,
                CONF_VACUUM: self.vacuum,
            }
        )
