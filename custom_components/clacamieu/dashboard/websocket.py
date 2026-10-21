"""WebSocket commands that read and change the Maison dashboard settings."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import area_registry as ar

from custom_components.clacamieu.const import DOMAIN

from .models import CONF_ROOM_AREA_IDS, DashboardConfig
from .runtime import DashboardRuntime

if TYPE_CHECKING:
    from homeassistant.components.websocket_api import ActiveConnection

COMMAND_GET_CONFIG = f"{DOMAIN}/dashboard/config"
COMMAND_UPDATE_CONFIG = f"{DOMAIN}/dashboard/config/update"


@callback
def async_register_commands(hass: HomeAssistant) -> None:
    """Register the dashboard commands. Registering again replaces them."""
    websocket_api.async_register_command(hass, ws_get_config)
    websocket_api.async_register_command(hass, ws_update_config)


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
        vol.Required(CONF_ROOM_AREA_IDS): [str],
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
        area_id
        for area_id in msg[CONF_ROOM_AREA_IDS]
        if areas.async_get_area(area_id) is None
    ]:
        connection.send_error(
            msg["id"],
            websocket_api.ERR_INVALID_FORMAT,
            f"Unknown areas: {', '.join(unknown)}",
        )
        return
    await runtime.async_update(DashboardConfig.from_dict(msg))
    connection.send_result(msg["id"], runtime.config.as_dict())


def _runtime(hass: HomeAssistant) -> DashboardRuntime | None:
    return next(
        (
            entry.runtime_data
            for entry in hass.config_entries.async_loaded_entries(DOMAIN)
            if isinstance(entry.runtime_data, DashboardRuntime)
        ),
        None,
    )
