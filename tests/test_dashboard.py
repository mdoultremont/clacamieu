"""Tests for the Maison dashboard panel and its settings."""

from typing import Any

from homeassistant import config_entries
from homeassistant.components.frontend import DATA_PANELS
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import area_registry as ar
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.typing import (
    ClientSessionGenerator,
    WebSocketGenerator,
)

from custom_components.clacamieu.const import (
    CONF_CONFIGURATION_TYPE,
    CONFIGURATION_TYPE_DASHBOARD,
    DOMAIN,
)


async def _setup_dashboard(hass: HomeAssistant) -> MockConfigEntry:
    entry = MockConfigEntry(
        domain=DOMAIN,
        unique_id=CONFIGURATION_TYPE_DASHBOARD,
        title="Maison",
        data={CONF_CONFIGURATION_TYPE: CONFIGURATION_TYPE_DASHBOARD},
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


def _panel(hass: HomeAssistant) -> dict[str, Any] | None:
    panel = hass.data.get(DATA_PANELS, {}).get("clacamieu")
    return None if panel is None else dict(panel.to_response())


async def _ws(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    message: dict[str, Any],
    access_token: str | None = None,
) -> dict[str, Any]:
    client = (
        await hass_ws_client(hass)
        if access_token is None
        else await hass_ws_client(hass, access_token)
    )
    await client.send_json_auto_id(message)
    return await client.receive_json()


async def test_flow_creates_a_single_dashboard_entry(
    recorder_mock: object, enable_custom_integrations: None, hass: HomeAssistant
) -> None:
    """The dashboard is a single-instance configuration type."""
    del recorder_mock, enable_custom_integrations
    results = []
    for _ in range(2):
        result = await hass.config_entries.flow.async_init(
            DOMAIN, context={"source": config_entries.SOURCE_USER}
        )
        results.append(
            await hass.config_entries.flow.async_configure(
                result["flow_id"],
                {CONF_CONFIGURATION_TYPE: CONFIGURATION_TYPE_DASHBOARD},
            )
        )

    assert results[0]["type"] is FlowResultType.CREATE_ENTRY
    assert results[0]["title"] == "Maison"
    assert results[0]["data"] == {CONF_CONFIGURATION_TYPE: CONFIGURATION_TYPE_DASHBOARD}
    assert results[1]["type"] is FlowResultType.ABORT
    assert results[1]["reason"] == "already_configured"


async def test_setup_adds_the_panel_for_every_user(
    recorder_mock: object,
    enable_custom_integrations: None,
    hass: HomeAssistant,
    hass_client: ClientSessionGenerator,
) -> None:
    """Every user sees the Maison panel, which loads the served bundle."""
    del recorder_mock, enable_custom_integrations
    entry = await _setup_dashboard(hass)

    panel = _panel(hass)
    assert panel is not None
    assert panel["title"] == "Maison"
    assert panel["icon"] == "mdi:home"
    assert panel["require_admin"] is False
    custom = panel["config"]["_panel_custom"]
    assert custom["name"] == "clacamieu-panel"
    assert custom["embed_iframe"] is False
    module_url = custom["module_url"]
    assert module_url.startswith("/clacamieu_static/main.js?v=")
    response = await (await hass_client()).get(module_url)
    assert response.status == 200
    assert not entry.supports_options


async def test_unload_removes_the_panel_and_reload_restores_it(
    recorder_mock: object, enable_custom_integrations: None, hass: HomeAssistant
) -> None:
    """Reloading the entry re-registers the panel on the existing static path."""
    del recorder_mock, enable_custom_integrations
    entry = await _setup_dashboard(hass)

    assert await hass.config_entries.async_unload(entry.entry_id)
    assert _panel(hass) is None
    assert await hass.config_entries.async_setup(entry.entry_id)
    assert _panel(hass) is not None


async def test_settings_default_to_every_area_and_persist(
    recorder_mock: object,
    enable_custom_integrations: None,
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_storage: dict[str, Any],
) -> None:
    """Admins choose the ordered rooms; the choice is saved."""
    del recorder_mock, enable_custom_integrations
    kitchen = ar.async_get(hass).async_create("Kitchen")
    bedroom = ar.async_get(hass).async_create("Bedroom")
    await _setup_dashboard(hass)

    default = await _ws(hass, hass_ws_client, {"type": "clacamieu/dashboard/config"})
    updated = await _ws(
        hass,
        hass_ws_client,
        {
            "type": "clacamieu/dashboard/config/update",
            "room_area_ids": [bedroom.id, kitchen.id],
        },
    )
    read_back = await _ws(hass, hass_ws_client, {"type": "clacamieu/dashboard/config"})
    await hass.async_block_till_done()

    assert default["result"] == {"room_area_ids": []}
    assert updated["result"] == {"room_area_ids": [bedroom.id, kitchen.id]}
    assert read_back["result"] == {"room_area_ids": [bedroom.id, kitchen.id]}
    assert hass_storage["clacamieu.dashboard"]["data"] == {
        "room_area_ids": [bedroom.id, kitchen.id]
    }


async def test_settings_reject_unknown_areas_and_non_admins(
    recorder_mock: object,
    enable_custom_integrations: None,
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_read_only_access_token: str,
) -> None:
    """Only admins change settings, and only to existing areas."""
    del recorder_mock, enable_custom_integrations
    kitchen = ar.async_get(hass).async_create("Kitchen")
    await _setup_dashboard(hass)

    unknown = await _ws(
        hass,
        hass_ws_client,
        {"type": "clacamieu/dashboard/config/update", "room_area_ids": ["attic"]},
    )
    non_admin_update = await _ws(
        hass,
        hass_ws_client,
        {"type": "clacamieu/dashboard/config/update", "room_area_ids": [kitchen.id]},
        hass_read_only_access_token,
    )
    non_admin_read = await _ws(
        hass,
        hass_ws_client,
        {"type": "clacamieu/dashboard/config"},
        hass_read_only_access_token,
    )

    assert unknown["success"] is False
    assert non_admin_update["error"]["code"] == "unauthorized"
    assert non_admin_read["result"] == {"room_area_ids": []}
