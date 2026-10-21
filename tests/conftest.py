"""Shared Home Assistant fixtures for Clacamieu tests."""

import pytest

pytest_plugins = "pytest_homeassistant_custom_component"


@pytest.fixture(autouse=True)
def frontend_loaded(request: pytest.FixtureRequest) -> None:
    """Mark the frontend as loaded, since its compiled assets are not installed."""
    if "hass" not in request.fixturenames:
        return
    # The Recorder mock must exist before the hass fixture starts.
    if "recorder_mock" in request.fixturenames:
        request.getfixturevalue("recorder_mock")
    request.getfixturevalue("hass").config.components.add("frontend")
