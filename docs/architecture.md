# Clacamieu architecture

Clacamieu has three independent config-entry families. Meter entries own
Recorder-backed sensor calculations. Light Group+ entries own one native light
entity and do not create or edit scenes. The single dashboard entry owns the
Maison sidebar panel and its settings.

## Maison panel architecture

The dashboard entry is single-instance. Its setup registers a `panel_custom`
panel at `/clacamieu` with the `clacamieu-panel` element, visible to every user.
`dashboard/panel.py` serves `frontend/dist/` at `/clacamieu_static` with cache
headers. Home Assistant cannot unregister a static path, so the path is
registered once per Home Assistant run and reused when the entry reloads. The
module URL carries the bundle modification time, which changes the URL after
every installed update. Unloading the entry removes the panel.

`dashboard/runtime.py` stores version 2 settings in `clacamieu.dashboard`.
`home_cards` selects ordered Accueil cards and `rooms` selects ordered
areas with optional temperature, humidity, and CO₂ entity overrides. Cards and
rooms can retain their position and options with `hidden: true`. Absent or false
means visible. Hidden rooms do not contribute to the indoor average. A null list
uses automatic configuration; an empty list hides every card or room. The Store
subclass uses Home Assistant's `_async_migrate_func` hook to migrate version 1
`room_area_ids` without changing the room order. An empty version 1 list becomes
null, preserving automatic selection. The migration is covered by store-backed
WebSocket tests.

`dashboard/websocket.py` exposes `clacamieu/dashboard/config` to every user and
`clacamieu/dashboard/config/update` to administrators. Updates replace both lists.
Voluptuous validates card types, required fields, entity ID syntax, alarm and
vacuum domains, unique card IDs and area IDs, and existing areas. Entities may be
missing or unavailable. Limits are 100 cards, 500 rooms, and 500 entities per
entities card. The settings model keeps validated mappings to avoid a separate
serialization model for each card.

The frontend never reads Home Assistant through anything other than the `hass`
property that Home Assistant sets on the panel element. `HassLike` in
`frontend/src/types.ts` names the subset the panel uses. In production the
real `hass` object satisfies it. In development, `dev-hass.ts` builds the same
shape from a WebSocket connection. It seeds in-memory dashboard settings from
one real read and handles both dashboard commands locally. Service calls and
all other commands outside the read-only allowlist remain blocked.
The element keeps the latest `hass` in a small store that React reads with
`useSyncExternalStore`. `buildHomeView` derives the Accueil screen from
`HassLike` and the settings as a pure function, so nothing instance-specific
lives in the bundle. `parseDashboardConfig` drops unknown or malformed entries at
the WebSocket boundary. `resolveDashboardConfig` fills null lists. Automatic
cards are summary, presence when people exist, the first alarm, the first vacuum,
rooms, and power when smart plug power sensors exist. Saved lists control order
and visibility. `HomeView.cards` holds a discriminated union for ordered rendering.
The admin-only Configuration screen edits a local draft through `config-editor.ts`.
Opening materializes automatic lists and appends missing areas as hidden. Reset
sets both lists to null. Done sends one complete replacement, while Cancel
discards the draft. Drawers, Select menus, confirmation
dialogs, and drag announcements mount in the panel's shadow-root portal container.
The panel reads Home Assistant's `route` property through a typed route model.
Navigation updates browser history and dispatches `location-changed`. Leaving
Configuration replaces its history entry. The development adapter mirrors browser
location changes into the same property. `buildRoomView` derives room climate,
ordered lights, scenes, devices, and sensors without side effects. Room controls
use the shared service action handler, including brightness data on slider commit.
The view contains the date. The summary contains the indoor average, its room
count, and weather. Entities
cards show ordered entity names and states, with `homeassistant.toggle` controls
for lights, switches, fans, and input booleans. Missing or unavailable entities
keep their rows, with disabled toggles.

Room sensor overrides take priority over area temperature and humidity settings,
then the first matching sensor in the area. Null overrides preserve automatic
resolution. CO₂ uses the `carbon_dioxide` device class. Smart plugs are power
sensors on devices that also expose a switch.

The element attaches its own shadow root, because Home Assistant renders panels
inside its own shadow trees. Document styles cannot reach the panel, and a
style element outside a shadow root of its own would leak into the Home
Assistant interface. The compiled Tailwind CSS is placed in that shadow root.
`PortalContainerContext` provides a themed container in the same shadow root
for future Drawer, Select, Popover, and Tooltip portals. Theme tokens follow
`hass.themes.darkMode`, falling back to the system color scheme.
Chromium and WebKit ignore `@property` and `@font-face` rules inside a shadow
root, so `shadow-styles.ts` moves those rules to one style element in the
document head. Tailwind relies on `@property` for its shadow, ring, and
transform defaults. Home Assistant wraps the element in an inline element
without a height, so the panel sizes itself to `100dvh`.

The companion apps open the user's default panel. Home Assistant stores it as
`default_panel` in the `core` frontend user data and accepts any panel, although
its profile picker lists only dashboards. The Plus screen writes that field for
the current user.

## Light Group+ architecture

A Light Group+ config entry stores a name, ordered member lights, and ordered
native scenes. The light platform maps each scene's visible Home Assistant name
to an effect. Duplicate
visible scene names are rejected because `light.turn_on(effect=...)` needs an
unambiguous mapping.

`LightGroupPlus` extends Home Assistant's internal `LightGroup` class and restores
its scene-backed effect list after every native group-state update. Home Assistant
therefore owns member tracking, state and attribute aggregation, supported modes,
and command forwarding. Tests protect this intentional internal API dependency.

Turning on always activates a configured scene. An explicit effect selects its
scene, while a plain turn-on selects the first configured scene. Other supported
light attributes are then forwarded through the native group implementation.
The current effect is runtime-only and is not restored after a reload or restart.
Scenes remain native Home Assistant scenes and retain their normal editing and
storage lifecycle.

## Configuration model

One config entry owns one measurement type, one optional price timeline,
individual sources and named groups:

```python
{
    "configuration_type": "electricity_energy",
    "source_entity_ids": ["sensor.dishwasher_energy"],
    "attach_entity_ids": ["sensor.dishwasher_energy"],
    "groups": [
        {
            "id": "stable-generated-id",
            "name": "Housekeeping",
            "entity_ids": ["sensor.dishwasher_energy"],
        }
    ],
    "price_entity_id": "input_number.electricity_price",
}
```

Entity selection is intentional. Every individual source is represented by a
virtual meter device. When requested, that device links to the physical source
through `via_device`. The physical device is not the measurement boundary
because it may expose several independent meters or rate sensors.

Group IDs remain stable when names change. Individual target IDs use the source
entity registry entry ID when available. Generated sensor unique IDs also
include the config entry ID, which allows the same source to appear in separate
pricing configurations. Home Assistant's entity platform treats the source-based
entity ID as a suggestion, resolves collisions and preserves user renames.

## Measurement normalization

`energy/models.py` maps each configuration type to a `MeasurementSpec`. The spec owns
the accepted source device class and state classes, Recorder unit class,
canonical source unit, result unit and result device class.

Cumulative energy and volume statistics become normalized cumulative series
directly. Hourly mean power in kW is integrated into kWh. Hourly mean volume flow
in m³/h is integrated into m³. Missing hourly rate statistics break continuity;
the integration keeps only the newest continuous suffix rather than presenting
an incomplete interval as complete.

## Module seams

The root `config_flow.py` adapter routes setup and options flows to a feature
family. `energy/configuration.py` owns meter schemas and validation, while
`lights/configuration.py` owns Light Group+ schemas and validation. The
dashboard family has no options flow.

`energy/discovery.py` is the Home Assistant state and entity-registry seam. It
validates configured entities and resolves them into immutable `MeterSource` and
`MeterTarget` values. It performs no automatic device discovery.

`energy/coordinator.py` owns live state for one physical input. A single
`MeterSourceRuntime` extends closed Recorder history with the current cumulative
state or integrates live rate changes. `PriceRuntime` owns the price timeline.

`energy/runtime.py` owns the config-entry lifecycle and shared derived data. It creates
one runtime per physical source, caches each individual or aggregate target
series once, and fans changes out to all derived sensor entities. This keeps the
number of Recorder readers and aggregate calculations independent from the
number of generated windows.

`energy/periods.py` contains pure calculations. `CumulativeSeries` calculates lifetime,
civil and rolling totals, combines source series, and derives a cost series from
a price timeline.

The root `sensor.py` adapter delegates to `energy/sensor.py`, which maps targets
and metrics to Home Assistant entities. Each individual
source and each group gets a virtual device. An individual virtual device may
link to its physical source device as its parent.

`energy/recorder.py` is the only module that queries or imports Recorder data. It reads
closed source hours and price changes, then resumes derived statistics after the
last imported hour.

The root `light.py` adapter delegates to `lights/group.py`, which owns the native
light group and its scene-backed effects.

## Correctness choices

- Aggregates use only history shared by every member.
- Recorder failures do not stop live tracking.
- Open Recorder hours are never backfilled.
- Rate history with a gap restarts after the gap.
- Price changes inside an hourly source bucket mark the result as estimated.
- A group becomes unavailable when any member lacks a usable current series.
