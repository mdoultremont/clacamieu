"""Tests for the Maison dashboard panel and its settings."""

from typing import Any

import pytest
from homeassistant import config_entries
from homeassistant.components import panel_custom
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


async def test_setup_opts_out_of_safe_area_padding_when_core_supports_it(
    recorder_mock: object,
    enable_custom_integrations: None,
    hass: HomeAssistant,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The panel insets itself, so it asks newer cores not to pad it."""
    del recorder_mock, enable_custom_integrations
    register = panel_custom.async_register_panel
    requested: list[bool] = []

    async def register_with_safe_area(
        *args: Any, handle_safe_area: bool = False, **kwargs: Any
    ) -> None:
        requested.append(handle_safe_area)
        await register(*args, **kwargs)

    monkeypatch.setattr(panel_custom, "async_register_panel", register_with_safe_area)
    await _setup_dashboard(hass)

    assert requested == [True]
    assert _panel(hass) is not None


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


async def test_settings_default_and_round_trip(
    recorder_mock: object,
    enable_custom_integrations: None,
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_storage: dict[str, Any],
) -> None:
    """Saved cards and rooms retain their order, including missing entities."""
    del recorder_mock, enable_custom_integrations
    kitchen = ar.async_get(hass).async_create("Kitchen")
    bedroom = ar.async_get(hass).async_create("Bedroom")
    await _setup_dashboard(hass)
    default = await _ws(hass, hass_ws_client, {"type": "clacamieu/dashboard/config"})
    assert default["result"] == {"home_cards": None, "rooms": None}
    config = {
        "home_cards": [
            {
                "id": "a",
                "type": "entities",
                "title": "Devices",
                "hidden": True,
                "entity_ids": ["switch.missing", "sensor.missing"],
            },
            {"id": "b", "type": "alarm", "entity_id": "alarm_control_panel.missing"},
            {"id": "c", "type": "vacuum", "entity_id": "vacuum.missing"},
            *[
                {"id": kind, "type": kind}
                for kind in ("summary", "presence", "rooms", "power")
            ],
        ],
        "rooms": [
            {
                "area_id": bedroom.id,
                "hidden": True,
                "temperature_entity_id": "sensor.missing",
                "humidity_entity_id": None,
                "co2_entity_id": "sensor.co2",
            },
            {"area_id": kitchen.id},
        ],
    }
    for saved in (
        config,
        {"home_cards": [], "rooms": []},
        {"home_cards": None, "rooms": None},
    ):
        updated = await _ws(
            hass, hass_ws_client, {"type": "clacamieu/dashboard/config/update", **saved}
        )
        assert updated["result"] == saved
        read_back = await _ws(
            hass, hass_ws_client, {"type": "clacamieu/dashboard/config"}
        )
        assert read_back["result"] == saved
        await hass.async_block_till_done()
        assert hass_storage["clacamieu.dashboard"]["version"] == 2
        assert hass_storage["clacamieu.dashboard"]["data"] == saved


@pytest.mark.usefixtures("recorder_mock", "enable_custom_integrations")
@pytest.mark.parametrize("area_ids", [[], ["bedroom", "kitchen"]])
async def test_settings_migrate_v1_store(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_storage: dict[str, Any],
    area_ids: list[str],
) -> None:
    """An installed v1 store preserves its room selection through migration."""
    hass_storage["clacamieu.dashboard"] = {
        "version": 1,
        "minor_version": 1,
        "key": "clacamieu.dashboard",
        "data": {"room_area_ids": area_ids},
    }
    await _setup_dashboard(hass)
    result = await _ws(hass, hass_ws_client, {"type": "clacamieu/dashboard/config"})
    assert result["result"] == {
        "home_cards": None,
        "rooms": [{"area_id": area_id} for area_id in area_ids] or None,
    }


@pytest.mark.parametrize(
    "settings",
    [
        {"home_cards": [{"id": "a", "type": "future"}]},
        {"home_cards": [{"id": "a", "type": "alarm"}]},
        {"home_cards": [{"id": "a", "type": "vacuum"}]},
        {"home_cards": [{"id": "a", "type": "entities", "entity_ids": []}]},
        {"home_cards": [{"id": "a", "type": "entities", "title": "Devices"}]},
        {"home_cards": [{"id": "", "type": "summary"}]},
        {"home_cards": [{"type": "summary"}]},
        {"home_cards": [{"id": "a", "type": "summary"}, {"id": "a", "type": "rooms"}]},
        {"home_cards": [{"id": "a", "type": "alarm", "entity_id": "vacuum.other"}]},
        {"home_cards": [{"id": "a", "type": "vacuum", "entity_id": "switch.other"}]},
        {"home_cards": [{"id": "a", "type": "vacuum", "entity_id": "malformed"}]},
        {
            "home_cards": [
                {
                    "id": "a",
                    "type": "entities",
                    "title": "Devices",
                    "entity_ids": ["bad"],
                }
            ]
        },
        {"home_cards": [{"id": str(i), "type": "summary"} for i in range(101)]},
        {
            "home_cards": [
                {
                    "id": "a",
                    "type": "entities",
                    "title": "Devices",
                    "entity_ids": ["sensor.a"] * 501,
                }
            ]
        },
        *[
            {"home_cards": [{"id": "a", "type": kind, "hidden": "false"}]}
            for kind in ("summary", "presence", "rooms", "power")
        ],
        {
            "home_cards": [
                {
                    "id": "a",
                    "type": "alarm",
                    "entity_id": "alarm_control_panel.test",
                    "hidden": 1,
                }
            ]
        },
        {
            "home_cards": [
                {
                    "id": "a",
                    "type": "vacuum",
                    "entity_id": "vacuum.test",
                    "hidden": None,
                }
            ]
        },
        {
            "home_cards": [
                {
                    "id": "a",
                    "type": "entities",
                    "title": "",
                    "entity_ids": [],
                    "hidden": [],
                }
            ]
        },
        {"rooms": [{"area_id": "kitchen", "hidden": "true"}]},
        {"home_cards": "automatic"},
        {"rooms": "automatic"},
        {"rooms": [{"area_id": "kitchen"}, {"area_id": "kitchen"}]},
        {"rooms": [{"area_id": "kitchen", "temperature_entity_id": "bad"}]},
        {"rooms": [{"area_id": "kitchen", "humidity_entity_id": 42}]},
        {"rooms": [{"area_id": "kitchen", "co2_entity_id": "bad"}]},
        {"rooms": [{"area_id": str(i)} for i in range(501)]},
        {"rooms": [{}]},
        {"home_cards": [{"id": "a", "type": "summary", "extra": True}]},
    ],
)
async def test_settings_reject_invalid_updates(
    recorder_mock: object,
    enable_custom_integrations: None,
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    settings: dict[str, Any],
) -> None:
    """Invalid updates leave the saved configuration unchanged."""
    del recorder_mock, enable_custom_integrations
    ar.async_get(hass).async_create("Kitchen")
    await _setup_dashboard(hass)
    result = await _ws(
        hass,
        hass_ws_client,
        {
            "type": "clacamieu/dashboard/config/update",
            "home_cards": None,
            "rooms": None,
            **settings,
        },
    )
    assert result["success"] is False
    assert result["error"]["code"] == "invalid_format"
    read_back = await _ws(hass, hass_ws_client, {"type": "clacamieu/dashboard/config"})
    assert read_back["result"] == {"home_cards": None, "rooms": None}


async def test_settings_reject_unknown_areas_and_non_admins(
    recorder_mock: object,
    enable_custom_integrations: None,
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_read_only_access_token: str,
) -> None:
    """Everyone reads settings; only admins can replace them with known areas."""
    del recorder_mock, enable_custom_integrations
    await _setup_dashboard(hass)
    unknown = await _ws(
        hass,
        hass_ws_client,
        {
            "type": "clacamieu/dashboard/config/update",
            "home_cards": None,
            "rooms": [{"area_id": "attic"}],
        },
    )
    assert unknown["error"] == {
        "code": "invalid_format",
        "message": "Unknown areas: attic",
    }
    non_admin_update = await _ws(
        hass,
        hass_ws_client,
        {
            "type": "clacamieu/dashboard/config/update",
            "home_cards": [],
            "rooms": [],
        },
        hass_read_only_access_token,
    )
    assert non_admin_update["error"]["code"] == "unauthorized"
    non_admin_read = await _ws(
        hass,
        hass_ws_client,
        {"type": "clacamieu/dashboard/config"},
        hass_read_only_access_token,
    )
    assert non_admin_read["result"] == {"home_cards": None, "rooms": None}
