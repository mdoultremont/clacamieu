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

**Room customization**
An admin's choice, per room, of the order of the room page's lights, devices, and openings and sensors, and of each element's display. An element shows as a Control (Commande), a Power reading (Conso) or a Cycle (Cycle) for smart plugs that measure power, or Hidden (Masqué). Hidden elements fold into one collapsed line at the bottom of the room page. Admins open it with Customize room (Personnaliser la pièce) from the room page header.
Avoid: room layout, room edit mode

**Cycle appliance**
A smart-plugged appliance that runs in cycles, such as a washing machine, dryer, or dishwasher, which an admin set to the Cycle display in its room. Maison shows whether it is running (En marche) or finished (Terminé) on its room page and as a chip under Home's date. Dismissing a finished cycle (Masquer) hides it on every device until the next cycle.
Avoid: program, wash, job

**Comfort**
The Maison page that compares climate and air quality across its visible rooms.
Its French name is Confort.

**Garden**
The Maison page for weather forecasts, outdoor climate sensors, and watering valves.
Its French name is Jardin.
