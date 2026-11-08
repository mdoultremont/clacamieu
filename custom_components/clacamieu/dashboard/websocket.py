"""WebSocket commands that read and change the Maison dashboard settings."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import config_validation as cv

from custom_components.clacamieu.const import DOMAIN

from .models import (
    CONF_HOME_CARDS,
    CONF_ROOMS,
    CONF_SECURITY,
    CONF_VACUUM,
    DashboardConfig,
)
from .runtime import DashboardRuntime

if TYPE_CHECKING:
    from collections.abc import Callable

    from homeassistant.components.websocket_api import ActiveConnection

COMMAND_GET_CONFIG = f"{DOMAIN}/dashboard/config"
COMMAND_UPDATE_CONFIG = f"{DOMAIN}/dashboard/config/update"
COMMAND_GET_CYCLES = f"{DOMAIN}/dashboard/cycles"
COMMAND_DISMISS_CYCLE = f"{DOMAIN}/dashboard/cycle/dismiss"


MAX_CARDS = 100
MAX_ROOMS = 500
MAX_ENTITIES = 500
ENTITY_DISPLAYS = ("control", "power", "cycle", "hidden")
VACUUM_SECTIONS = ("shortcuts", "rooms", "maintenance", "station", "statistics")
MAX_NAME_LENGTH = 100


def _unique(key: str) -> Callable[[list[dict[str, Any]]], list[dict[str, Any]]]:
    def validate(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        values = [item[key] for item in items]
        if len(set(values)) != len(values):
            raise vol.Invalid(f"Duplicate {key}")
        return items

    return validate


def _domain_entity(domain: str) -> Callable[[str], str]:
    def validate(value: str) -> str:
        entity_id = cv.entity_id(value)
        if entity_id.split(".", 1)[0] != domain:
            raise vol.Invalid(f"Expected {domain} entity")
        return entity_id

    return validate


CARD_SCHEMA = vol.Any(
    *[
        vol.Schema(
            {
                vol.Required("id"): vol.All(str, vol.Length(min=1)),
                vol.Required("type"): card_type,
                vol.Optional("hidden"): bool,
            }
        )
        for card_type in ("summary", "power")
    ],
    vol.Schema(
        {
            vol.Required("id"): vol.All(str, vol.Length(min=1)),
            vol.Required("type"): "rooms",
            vol.Optional("hidden"): bool,
            vol.Optional("area_ids"): vol.All(
                [vol.All(str, vol.Length(min=1))],
                vol.Length(max=MAX_ROOMS),
                vol.Unique(),
            ),
        }
    ),
    *[
        vol.Schema(
            {
                vol.Required("id"): vol.All(str, vol.Length(min=1)),
                vol.Required("type"): card_type,
                vol.Optional("hidden"): bool,
                vol.Required("entity_id"): _domain_entity(domain),
            }
        )
        for card_type, domain in (
            ("alarm", "alarm_control_panel"),
            ("vacuum", "vacuum"),
        )
    ],
    vol.Schema(
        {
            vol.Required("id"): vol.All(str, vol.Length(min=1)),
            vol.Required("type"): "entities",
            vol.Optional("hidden"): bool,
            vol.Required("title"): str,
            vol.Required("entity_ids"): vol.All(
                [cv.entity_id], vol.Length(max=MAX_ENTITIES)
            ),
        }
    ),
)
ROOM_ENTITY_SCHEMA = vol.Schema(
    {
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("display"): vol.In(ENTITY_DISPLAYS),
        vol.Optional("name"): vol.All(
            str, vol.Strip, vol.Length(min=1, max=MAX_NAME_LENGTH)
        ),
    }
)
SECURITY_SCHEMA = vol.Schema(
    {
        vol.Required("hidden_entity_ids"): vol.All(
            [cv.entity_id], vol.Length(max=MAX_ENTITIES), vol.Unique()
        ),
    }
)
VACUUM_SCHEMA = vol.Schema(
    {
        vol.Required("sections"): vol.All(
            [vol.In(VACUUM_SECTIONS)],
            vol.Length(max=len(VACUUM_SECTIONS)),
            vol.Unique(),
        ),
    }
)
ROOM_SCHEMA = vol.Schema(
    {
        vol.Required("area_id"): vol.All(str, vol.Length(min=1)),
        vol.Optional("hidden"): bool,
        vol.Optional("entities"): vol.All(
            [ROOM_ENTITY_SCHEMA],
            vol.Length(max=MAX_ENTITIES),
            _unique("entity_id"),
        ),
        **{
            vol.Optional(key): vol.Any(None, cv.entity_id)
            for key in ("temperature_entity_id", "humidity_entity_id", "co2_entity_id")
        },
    }
)


@callback
def async_register_commands(hass: HomeAssistant) -> None:
    """Register the dashboard commands. Registering again replaces them."""
    websocket_api.async_register_command(hass, ws_get_config)
    websocket_api.async_register_command(hass, ws_update_config)
    websocket_api.async_register_command(hass, ws_get_cycles)
    websocket_api.async_register_command(hass, ws_dismiss_cycle)


@websocket_api.websocket_command({vol.Required("type"): COMMAND_GET_CONFIG})
@callback
def ws_get_config(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return the dashboard settings."""
    if (runtime := _runtime(hass)) is None:
        connection.send_error(
            msg["id"], websocket_api.ERR_NOT_FOUND, "Dashboard not set up"
        )
        return
    connection.send_result(msg["id"], runtime.config.as_dict())


@websocket_api.websocket_command(
    {
        vol.Required("type"): COMMAND_UPDATE_CONFIG,
        vol.Required(CONF_HOME_CARDS): vol.Any(
            None, vol.All([CARD_SCHEMA], vol.Length(max=MAX_CARDS), _unique("id"))
        ),
        vol.Required(CONF_ROOMS): vol.Any(
            None, vol.All([ROOM_SCHEMA], vol.Length(max=MAX_ROOMS), _unique("area_id"))
        ),
        vol.Optional(CONF_SECURITY, default=None): vol.Any(None, SECURITY_SCHEMA),
        vol.Optional(CONF_VACUUM, default=None): vol.Any(None, VACUUM_SCHEMA),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_update_config(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Replace the dashboard settings."""
    if (runtime := _runtime(hass)) is None:
        connection.send_error(
            msg["id"], websocket_api.ERR_NOT_FOUND, "Dashboard not set up"
        )
        return
    areas = ar.async_get(hass)
    if unknown := [
        room["area_id"]
        for room in msg[CONF_ROOMS] or []
        if areas.async_get_area(room["area_id"]) is None
    ]:
        connection.send_error(
            msg["id"],
            websocket_api.ERR_INVALID_FORMAT,
            f"Unknown areas: {', '.join(unknown)}",
        )
        return
    await runtime.async_update(DashboardConfig.from_dict(msg))
    connection.send_result(msg["id"], runtime.config.as_dict())


@websocket_api.websocket_command({vol.Required("type"): COMMAND_GET_CYCLES})
@callback
def ws_get_cycles(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return the end of each cycle appliance's dismissed cycle."""
    if (runtime := _runtime(hass)) is None:
        connection.send_error(
            msg["id"], websocket_api.ERR_NOT_FOUND, "Dashboard not set up"
        )
        return
    connection.send_result(msg["id"], {"dismissed": dict(runtime.cycle_dismissals)})


@websocket_api.websocket_command(
    {
        vol.Required("type"): COMMAND_DISMISS_CYCLE,
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("ended_at"): cv.datetime,
    }
)
@websocket_api.async_response
async def ws_dismiss_cycle(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Hide a finished cycle on every device until the appliance runs again."""
    if (runtime := _runtime(hass)) is None:
        connection.send_error(
            msg["id"], websocket_api.ERR_NOT_FOUND, "Dashboard not set up"
        )
        return
    if hass.states.get(msg["entity_id"]) is None:
        connection.send_error(
            msg["id"],
            websocket_api.ERR_NOT_FOUND,
            f"Unknown entity: {msg['entity_id']}",
        )
        return
    await runtime.async_dismiss_cycle(msg["entity_id"], msg["ended_at"])
    connection.send_result(msg["id"], {"dismissed": dict(runtime.cycle_dismissals)})


def _runtime(hass: HomeAssistant) -> DashboardRuntime | None:
    return next(
        (
            entry.runtime_data
            for entry in hass.config_entries.async_loaded_entries(DOMAIN)
            if isinstance(entry.runtime_data, DashboardRuntime)
        ),
        None,
    )
