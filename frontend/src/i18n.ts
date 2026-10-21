export const en = {
  unavailable: "Unavailable",
  home: "Home",
  rooms: "Rooms",
  security: "Security",
  energy: "Energy",
  more: "More",
  inside: "Indoors",
  outside: "Outside",
  noClimate: "No sensors",
  averageRooms: (count: number) =>
    `Average of ${count} room${count === 1 ? "" : "s"}`,
  battery: (level: string) => `Battery ${level} %`,
  atHome: "At home",
  nobodyHome: "Nobody home",
  alarmLabel: "Alarm",
  openingsLeaks: "Openings and leaks",
  noSafetySensors: "No sensors",
  plugs: "Plugs",
  noRooms: "No rooms configured",
  lightsOn: (count: number) =>
    count === 0 ? "No lights on" : `${count} light${count === 1 ? "" : "s"} on`,
  openingsClosed: (count: number) =>
    `${count} opening${count === 1 ? "" : "s"} closed`,
  openingsOpen: (count: number) => `${count} open`,
  noLeak: "no leaks",
  leak: "leak detected",
  arm: "Arm",
  disarm: "Disarm",
  start: "Start",
  return: "Return",
  plugPower: "Plug power",
  overview: "Overview",
  settings: "Settings",
  haMenu: "Home Assistant menu",
  defaultPanel: "Open the app on Maison",
  dashboards: "Dashboards",
  preferences: "Preferences",
  loading: "Connecting to Home Assistant…",
  connectionError:
    "Unable to connect to Home Assistant. Check the development environment and reload.",
  actionError: "The action failed. Try again.",
  blockedError: "This action is blocked in development.",
  preferenceError: "Unable to load your preference. Try reopening this screen.",
  alarm: {
    disarmed: "Alarm disarmed",
    armed_away: "Alarm armed · away",
    armed_home: "Alarm armed · home",
    armed_night: "Alarm armed · night",
    armed_vacation: "Alarm armed · vacation",
    arming: "Arming…",
    pending: "Entry detected",
    triggered: "Alarm triggered",
    armed_custom_bypass: "Alarm armed · custom",
    disarming: "Disarming…",
    unavailable: "Alarm unavailable",
    unknown: "Alarm status unknown",
  },
  vacuum: {
    docked: "Docked",
    cleaning: "Cleaning",
    returning: "Returning to base",
    idle: "Ready",
    paused: "Paused",
    error: "Error",
    unavailable: "Unavailable",
    unknown: "Status unknown",
  },
  weather: {
    sunny: "Sunny",
    "clear-night": "Clear night",
    cloudy: "Cloudy",
    partlycloudy: "Partly cloudy",
    rainy: "Rainy",
    pouring: "Pouring",
    snowy: "Snowy",
    "snowy-rainy": "Sleet",
    fog: "Fog",
    hail: "Hail",
    lightning: "Lightning",
    "lightning-rainy": "Thunderstorm",
    windy: "Windy",
    "windy-variant": "Windy and cloudy",
    exceptional: "Exceptional",
    unavailable: "Weather unavailable",
    unknown: "Weather unknown",
  },
};

type Messages = {
  [K in keyof typeof en]: (typeof en)[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : (typeof en)[K] extends string
      ? string
      : { [P in keyof (typeof en)[K]]: string };
};

export const fr: Messages = {
  unavailable: "Indisponible",
  home: "Accueil",
  rooms: "Pièces",
  security: "Sécurité",
  energy: "Énergie",
  more: "Plus",
  inside: "Intérieur",
  outside: "Dehors",
  noClimate: "Aucun capteur",
  averageRooms: (count) => `Moyenne de ${count} pièce${count === 1 ? "" : "s"}`,
  battery: (level) => `Batterie ${level} %`,
  atHome: "À la maison",
  nobodyHome: "Personne à la maison",
  alarmLabel: "Alarme",
  openingsLeaks: "Ouvertures et fuites",
  noSafetySensors: "Aucun capteur",
  plugs: "Prises",
  noRooms: "Aucune pièce configurée",
  lightsOn: (count) =>
    count === 0
      ? "Aucune lumière allumée"
      : `${count} lumière${count === 1 ? "" : "s"} allumée${count === 1 ? "" : "s"}`,
  openingsClosed: (count) =>
    `${count} ouverture${count === 1 ? "" : "s"} fermée${count === 1 ? "" : "s"}`,
  openingsOpen: (count) => `${count} ouverte${count === 1 ? "" : "s"}`,
  noLeak: "aucune fuite",
  leak: "fuite détectée",
  arm: "Armer",
  disarm: "Désarmer",
  start: "Lancer",
  return: "Retour",
  plugPower: "Puissance prises",
  overview: "Aperçu",
  settings: "Paramètres",
  haMenu: "Menu Home Assistant",
  defaultPanel: "Ouvrir l'app sur Maison",
  dashboards: "Tableaux de bord",
  preferences: "Préférences",
  loading: "Connexion à Home Assistant…",
  connectionError:
    "Connexion à Home Assistant impossible. Vérifiez l'environnement de développement et rechargez la page.",
  actionError: "L'action a échoué. Réessayez.",
  blockedError: "Cette action est bloquée en développement.",
  preferenceError:
    "Impossible de charger votre préférence. Rouvrez cet écran pour réessayer.",
  alarm: {
    disarmed: "Alarme désarmée",
    armed_away: "Alarme armée · absence",
    armed_home: "Alarme armée · présence",
    armed_night: "Alarme armée · nuit",
    armed_vacation: "Alarme armée · vacances",
    arming: "Armement…",
    pending: "Entrée détectée",
    triggered: "Alarme déclenchée",
    armed_custom_bypass: "Alarme armée · personnalisé",
    disarming: "Désarmement…",
    unavailable: "Alarme indisponible",
    unknown: "État de l'alarme inconnu",
  },
  vacuum: {
    docked: "À la base",
    cleaning: "Nettoyage en cours",
    returning: "Retour à la base",
    idle: "Prêt",
    paused: "En pause",
    error: "Erreur",
    unavailable: "Indisponible",
    unknown: "État inconnu",
  },
  weather: {
    sunny: "Ensoleillé",
    "clear-night": "Nuit dégagée",
    cloudy: "Nuageux",
    partlycloudy: "Partiellement nuageux",
    rainy: "Pluvieux",
    pouring: "Pluie intense",
    snowy: "Neigeux",
    "snowy-rainy": "Pluie et neige",
    fog: "Brouillard",
    hail: "Grêle",
    lightning: "Orage",
    "lightning-rainy": "Pluie et orage",
    windy: "Venteux",
    "windy-variant": "Venteux et nuageux",
    exceptional: "Exceptionnel",
    unavailable: "Météo indisponible",
    unknown: "Météo inconnue",
  },
};

export const messages = (language: string): Messages =>
  language.toLowerCase().startsWith("fr") ? fr : en;
export const locale = (language: string): string => {
  try {
    return Intl.getCanonicalLocales(language.replaceAll("_", "-"))[0] ?? "en";
  } catch {
    return "en";
  }
};
export function translatedState(
  table: Record<string, string>,
  state: string,
): string {
  return table[state] ?? table.unknown;
}
