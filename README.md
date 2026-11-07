<p align="center">
  <img src="assets/clacamieu-logo.png" alt="Clacamieu logo" width="240">
</p>

# Clacamieu

Clacamieu is a Home Assistant custom integration that adds calendar,
rolling and lifetime totals to utility meters and instantaneous rate sensors.
It supports electricity, water and gas, named aggregates, historical
reconstruction and time-varying unit prices. It also provides Light Group+,
a native light group whose effects activate configured Home Assistant scenes.

## Light Group+

Light Group+ creates a standard `light` entity from several member lights. Its
effect list contains the visible names of selected native Home Assistant scenes.
Calling `light.turn_on` with an effect activates the matching scene. Turning the
group on without an effect activates the first configured scene.

The group uses Home Assistant's native light-group aggregation for its state,
brightness, colors, supported modes, and commands. Scenes remain editable
through Home Assistant. The selected effect is kept only in memory and is not
restored after an integration reload or Home Assistant restart.

## Maison dashboard

Maison is a household dashboard in the Home Assistant sidebar, built for the
companion app on phones. It is a custom panel, not a Lovelace dashboard, and
needs no YAML. Add it once from **Settings > Devices & services > Clacamieu**
with the **Maison dashboard** type. Every user sees it.

Maison has five tabs:

- **Home** shows the date, the outdoor weather, and one block per card: the
  alarm, the robot vacuum, your favorite rooms, the power drawn by smart plugs, and any entity list you add. Admins
  choose and order the favorite rooms in the rooms card options of Configure
  Maison.
- **Pièces** shows a card per room. The card's icon turns the room's lights on
  or off, through the room's lighting script when it has one. The card shows
  temperature, humidity, and CO₂, and opens the room page.
  Each room page shows its climate, with the change over the last hour, and
  controls its lights, brightness, scenes, switches, covers, and media players.
- **Sécurité** arms and disarms the alarm, with a confirmation and a code when
  Home Assistant asks for one. It also shows camera stills, doors and windows,
  leak sensors, smoke or gas detectors, and the last 24 hours of activity.
- **Énergie** reads Home Assistant's own Energy settings and statistics. It shows
  the current plug power and the consumption, cost, and change for the day,
  week, month, or year, per device.
- **Plus** opens pages for comfort, the robot vacuum, the garden, and the
  system, links to Home Assistant, and holds the setting that opens the
  companion app on Maison.

Rooms are Home Assistant areas. Each area's temperature and humidity sensors
from its area settings are used first.

Administrators choose and order the Home cards and the rooms from the panel.
Tap **Configurer Maison** in Plus. Each card and room
can be shown or hidden, moved, and edited. A room can use specific temperature,
humidity, and CO₂ sensors. **Terminé** saves the settings for the whole
household. Without saved settings, Maison picks the cards and shows every area.

To open the companion app directly on Maison, turn on **Open the app on Maison**
in the Plus tab. The setting applies to the current user.

## Configuration types

Each config entry handles one source type and one optional unit price:

- cumulative electricity energy;
- instantaneous electricity power, integrated into energy;
- cumulative water volume;
- instantaneous water flow, integrated into volume;
- cumulative gas volume;
- instantaneous gas flow, integrated into volume.

Sources are selected as sensor entities, not devices. This supports devices with
several channels, such as a two-valve water controller or a multi-socket power
strip. A source device does not need a `switch` entity.

An individual source receives a virtual Clacamieu meter containing its
derived sensors. By default, the meter is linked below the physical source
device, but it can remain standalone. Named groups create virtual
Clacamieu devices containing the sum of their selected members. A source
may belong to any number of groups and does not need to be selected as an
individual source.

Create separate config entries when sources use different prices or represent
different source types.

## Metrics

Every individual source and named group receives ten sensors:

- lifetime total;
- today, this week, this month, this quarter and this year;
- the last 24 hours, 7 days, 3 calendar months and 365 days.

Electricity results use kWh. Water and gas results use m³. Derived sensors use
`state_class: total` and the matching Home Assistant device class.

Three rolling months means the same local date and time three months earlier,
with the day clamped when needed. It is not treated as 90 days.

## Pricing

Each config entry accepts an optional numeric entity containing the current
price per kWh or m³. When configured, Clacamieu creates ten matching
monetary sensors in the Home Assistant currency.

The price may change over time. Clacamieu applies the active price to later
increments, so tariff changes do not revalue older consumption. Tariff
schedules, supplier APIs and automations remain outside the integration.

## Compatible sources

Cumulative configurations accept `total` and `total_increasing` sensors with the
matching Home Assistant device class and a convertible unit. Rate configurations
accept `measurement` sensors with `power` or `volume_flow_rate` device classes.
The config flow filters candidates and validates their current metadata before
saving them.

## History

Recorder is the source of truth. Clacamieu reads closed hourly statistics,
normalizes cumulative meter resets and integrates hourly means for power and
flow sources. It reconstructs only periods supported by continuous history and
never imports the open Recorder hour.

Historical price changes come from the selected price entity's Recorder state
history. Source statistics are hourly, so a tariff boundary inside an hour uses
a linear estimate for that hour. The `history_complete` and `estimated`
attributes describe the current result.

## Installation from the Marketplace

Home Assistant 2026.11 and later install custom repositories from the
Marketplace.

1. Go to **Settings > Marketplace** and select **Add from link**.
2. Enter `https://github.com/mdoultremont/clacamieu` and select **Add**. Custom
   repositories need a GitHub connection. If the Marketplace asks for one,
   select **Continue**, open the GitHub link, and enter the code shown. If it
   asks for a type, choose `Integration`.
3. Open the Clacamieu page, select **Install**, and confirm the version. Restart Home
   Assistant when a repair asks for it.
4. Add Clacamieu from **Settings > Devices & services**.
5. Choose a meter source type or Light Group+. Meter configurations accept
   individual sensor rows, named groups and an optional current price. Light
   Group+ accepts member lights and an ordered scene list.

The minimum supported Home Assistant version is 2026.2. On versions before
2026.11, add the same URL as a HACS custom repository with category
`Integration`. Updating to 2026.11 moves an existing HACS installation to the
Marketplace automatically.

### Replacing HA Toolkit

Clacamieu was previously published as HA Toolkit with the `ha_toolkit` domain.
Home Assistant treats the new `clacamieu` domain as a different integration, so
existing HA Toolkit entries are not migrated. Recreate them after installing
Clacamieu.

1. Note the sources, groups, prices, and Light Group+ settings of each HA Toolkit
   entry, then remove the entries from **Settings > Devices & services**.
2. Uninstall HA Toolkit from **Settings > Marketplace**, or from HACS before
   2026.11.
3. Restart Home Assistant before adding the repository again. GitHub repository
   renames preserve an internal identifier, so the old `ha_toolkit`
   installation directory may otherwise remain.
4. Add `https://github.com/mdoultremont/clacamieu` as described above.
5. Confirm that `/config/custom_components/clacamieu` exists after installing,
   restart Home Assistant, and recreate the entries.

## Development

The test suite requires Python 3.13.2.

```bash
uv sync
uv run ruff check .
uv run ruff format --check .
uv run pytest
```

The Maison panel requires Node.js 22 and pnpm. Its built module is committed in
`custom_components/clacamieu/frontend/dist/`.

```bash
pnpm --dir frontend install
pnpm --dir frontend typecheck
pnpm --dir frontend test
pnpm --dir frontend build
```

The architecture is documented in
[`docs/architecture.md`](docs/architecture.md).
