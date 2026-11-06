# Clacamieu

Clacamieu collects optional improvements to existing Home Assistant features in one custom integration.

## Product language

**Clacamieu**
The umbrella integration installed by the user.
Avoid: HA Toolkit, MattsAssistant, assistant

**Energy**
Features that calculate civil, rolling, and lifetime consumption or cost from Home Assistant history.
Avoid: Energy Enhancer

**Lights**
Features that extend native Home Assistant lights, groups, and scenes.
Avoid: Lights Enhancer

**Device Management**
User-maintained metadata for physical devices, including inventory codes and notes.
Avoid: Device Enhancer

**Maison**
The household dashboard that Clacamieu adds to the Home Assistant sidebar as a custom panel. Its name stays Maison in every language.
Its Home screen, named Home in every language, contains ordered cards and room cards. A room card turns the room's lights on or off from its icon and opens the room page from the rest of the card. Home favorites are the rooms an admin picks and orders for Home in Configure Maison; the Pièces tab still shows every room. Each room represents a Home Assistant area and can override its climate sensors.
Avoid: Home (for Maison itself), Lovelace dashboard

**Comfort**
The Maison page that compares climate and air quality across its visible rooms.
Its French name is Confort.

**Garden**
The Maison page for weather forecasts, outdoor climate sensors, and watering valves.
Its French name is Jardin.
