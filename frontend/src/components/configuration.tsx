import { useReducer, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  LoaderCircle,
  Plus,
  Trash2,
} from "lucide-react";
import {
  configEditorReducer,
  createConfigEditor,
  defaultCard,
  editorLists,
  newCardId,
  type ConfigEditorAction,
} from "../config-editor";
import { numeric } from "../home-view";
import { locale, messages } from "../i18n";
import {
  climateSensors,
  entityArea,
  resolveRoomSensors,
} from "../room-sensors";
import type { DashboardConfig, HassLike, HomeCard, RoomConfig } from "../types";
import { ConfigSortableList } from "./config-sortable-list";
import { ItemSection } from "./item-section";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "./ui/drawer";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

type Selection =
  | { type: "card"; id: string }
  | { type: "room"; id: string }
  | { type: "add" }
  | null;
const cardTypes = [
  "summary",
  "presence",
  "alarm",
  "vacuum",
  "rooms",
  "power",
  "entities",
] as const;

function cardTitles(language: string): Record<HomeCard["type"], string> {
  const t = messages(language);
  return {
    summary: t.summaryLabel,
    presence: t.presenceLabel,
    alarm: t.alarmLabel,
    vacuum: t.vacuumLabel,
    rooms: t.rooms,
    power: t.powerLabel,
    entities: t.entitiesLabel,
  };
}
function entityName(hass: HassLike, id: string) {
  return (
    hass.states[id]?.attributes.friendly_name ?? hass.entities[id]?.name ?? id
  );
}
function entityValue(hass: HassLike, id: string) {
  const entity = hass.states[id];
  if (!entity) return messages(hass.language).unavailable;
  if (["unavailable", "unknown"].includes(entity.state))
    return messages(hass.language).unavailable;
  const value = numeric(entity.state);
  return (
    hass.formatEntityState?.(entity) ??
    `${value === null ? entity.state : new Intl.NumberFormat(locale(hass.language), { maximumFractionDigits: 2 }).format(value)} ${entity.attributes.unit_of_measurement ?? ""}`.trim()
  );
}

export function Configuration({
  hass,
  config,
  onCancel,
  onSave,
}: {
  hass: HassLike;
  config: DashboardConfig;
  onCancel: () => void;
  onSave: (config: DashboardConfig) => Promise<void>;
}) {
  const [state, dispatch] = useReducer(configEditorReducer, undefined, () =>
    createConfigEditor(config, hass),
  );
  const [selection, setSelection] = useState<Selection>(null);
  const [saveState, setSaveState] = useState<"ready" | "saving" | "error">(
    "ready",
  );
  const saving = useRef(false);
  const t = messages(hass.language);
  const titles = cardTitles(hass.language);
  const lists = editorLists(state);
  const card =
    selection?.type === "card"
      ? lists.home_cards.find((card) => card.id === selection.id)
      : undefined;
  const room =
    selection?.type === "room"
      ? lists.rooms.find((room) => room.area_id === selection.id)
      : undefined;
  const cardIndex = card ? lists.home_cards.indexOf(card) : -1;
  const roomIndex = room ? lists.rooms.indexOf(room) : -1;
  async function save() {
    if (saving.current) return;
    saving.current = true;
    setSaveState("saving");
    try {
      await onSave(state.config);
    } catch {
      setSaveState("error");
    } finally {
      saving.current = false;
    }
  }
  function add(type: HomeCard["type"]) {
    const card = defaultCard(type, newCardId(), hass, t.entitiesLabel);
    if (card) {
      dispatch({ type: "add-card", card });
      setSelection({ type: "card", id: card.id });
    }
  }
  return (
    <main className="page-scroll" aria-busy={saveState === "saving"}>
      <div className="page-content config-content">
        <header className="config-header">
          <Button
            variant="ghost"
            className="min-h-11 min-w-11 px-2"
            disabled={saveState === "saving"}
            onClick={onCancel}
          >
            {t.cancel}
          </Button>
          <h1 className="text-center text-base font-semibold tracking-tight">
            {t.configuration}
          </h1>
          <Button
            variant="ghost"
            className="min-h-11 min-w-11 px-2"
            disabled={saveState === "saving"}
            onClick={save}
          >
            {saveState === "saving" && (
              <LoaderCircle
                className="size-4 animate-spin"
                aria-label={t.saving}
              />
            )}
            {t.done}
          </Button>
        </header>
        {saveState === "error" && (
          <p className="error" role="alert">
            {t.saveError}
          </p>
        )}
        <fieldset
          disabled={saveState === "saving"}
          className="flex min-w-0 flex-col gap-6 border-0 p-0"
        >
          <ItemSection title={t.homeCards} description={t.dragToReorder}>
            <ConfigSortableList
              rows={lists.home_cards.map((card) => ({
                id: card.id,
                title: titles[card.type],
                hidden: card.hidden,
                description:
                  "entity_id" in card
                    ? entityName(hass, card.entity_id)
                    : card.type === "entities"
                      ? card.title
                      : undefined,
              }))}
              language={hass.language}
              onMove={(from, to) =>
                dispatch({ type: "reorder", list: "home_cards", from, to })
              }
              onToggle={(id) => dispatch({ type: "toggle-card", id })}
              onEdit={(id) => setSelection({ type: "card", id })}
            />
            <div role="listitem" className="border-t">
              <button
                className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() => setSelection({ type: "add" })}
                disabled={lists.home_cards.length >= 100}
              >
                <Plus className="size-4 shrink-0" />
                <span className="flex-1 font-medium">{t.addCard}</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            </div>
          </ItemSection>
          <ItemSection title={t.rooms} description={t.roomSensors}>
            <ConfigSortableList
              rows={lists.rooms.map((room) => ({
                id: room.area_id,
                title: hass.areas[room.area_id]?.name ?? room.area_id,
                hidden: room.hidden,
                description:
                  resolveRoomSensors(hass, room)
                    .filter(({ entity }) => entity)
                    .map(({ label }) => t[label])
                    .join(", ") || t.noClimate,
              }))}
              language={hass.language}
              onMove={(from, to) =>
                dispatch({ type: "reorder", list: "rooms", from, to })
              }
              onToggle={(areaId) => dispatch({ type: "toggle-room", areaId })}
              onEdit={(id) => setSelection({ type: "room", id })}
            />
          </ItemSection>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                className="min-h-11 self-start text-destructive"
              >
                {t.resetAutomatic}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t.resetTitle}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t.resetDescription}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => dispatch({ type: "reset" })}
                >
                  {t.resetConfirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </fieldset>
      </div>
      <Drawer
        open={selection !== null}
        onOpenChange={(open) => {
          if (!open) setSelection(null);
        }}
        shouldScaleBackground={false}
        noBodyStyles
      >
        <DrawerContent className="config-drawer">
          <DrawerHeader>
            <DrawerTitle>
              {card
                ? titles[card.type]
                : room
                  ? (hass.areas[room.area_id]?.name ?? room.area_id)
                  : t.addCard}
            </DrawerTitle>
            <DrawerDescription>
              {room
                ? t.roomOptions
                : selection?.type === "add"
                  ? cardTypes.map((type) => titles[type]).join(", ")
                  : t.cardOptions}
            </DrawerDescription>
          </DrawerHeader>
          <div className="config-drawer-body">
            {selection?.type === "add" && (
              <div className="divide-y rounded-xl border">
                {cardTypes.map((type) => {
                  const available = !!defaultCard(
                    type,
                    "preview",
                    hass,
                    t.entitiesLabel,
                  );
                  return (
                    <button
                      key={type}
                      disabled={!available}
                      className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 disabled:text-muted-foreground"
                      onClick={() => add(type)}
                    >
                      <span className="flex-1">
                        {titles[type]}
                        {!available && (
                          <span className="block text-xs text-muted-foreground">
                            {t.noEntityForType}
                          </span>
                        )}
                      </span>
                      <Plus className="size-4" />
                    </button>
                  );
                })}
              </div>
            )}
            {card && (
              <>
                <CardOptions
                  key={card.id}
                  card={card}
                  hass={hass}
                  dispatch={dispatch}
                />
                <MoveButtons
                  language={hass.language}
                  index={cardIndex}
                  count={lists.home_cards.length}
                  onMove={(to) =>
                    dispatch({
                      type: "reorder",
                      list: "home_cards",
                      from: cardIndex,
                      to,
                    })
                  }
                />
                <Button
                  variant="ghost"
                  className="justify-start text-destructive"
                  onClick={() => {
                    dispatch({ type: "remove-card", id: card.id });
                    setSelection(null);
                  }}
                >
                  <Trash2 />
                  {t.removeCard}
                </Button>
              </>
            )}
            {room && (
              <>
                <RoomOptions room={room} hass={hass} dispatch={dispatch} />
                <MoveButtons
                  language={hass.language}
                  index={roomIndex}
                  count={lists.rooms.length}
                  onMove={(to) =>
                    dispatch({
                      type: "reorder",
                      list: "rooms",
                      from: roomIndex,
                      to,
                    })
                  }
                />
              </>
            )}
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="outline">{t.close}</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </main>
  );
}

function MoveButtons({
  language,
  index,
  count,
  onMove,
}: {
  language: string;
  index: number;
  count: number;
  onMove: (to: number) => void;
}) {
  const t = messages(language);
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button
        variant="outline"
        disabled={index <= 0}
        onClick={() => onMove(index - 1)}
      >
        <ArrowUp />
        {t.moveUp}
      </Button>
      <Button
        variant="outline"
        disabled={index >= count - 1}
        onClick={() => onMove(index + 1)}
      >
        <ArrowDown />
        {t.moveDown}
      </Button>
    </div>
  );
}

function CardOptions({
  card,
  hass,
  dispatch,
}: {
  card: HomeCard;
  hass: HassLike;
  dispatch: (action: ConfigEditorAction) => void;
}) {
  const t = messages(hass.language);
  const [adding, setAdding] = useState(false);
  if (card.type === "alarm" || card.type === "vacuum") {
    const domain = card.type === "alarm" ? "alarm_control_panel" : "vacuum";
    const ids = [
      ...new Set([
        card.entity_id,
        ...Object.keys(hass.states).filter((id) => id.startsWith(`${domain}.`)),
      ]),
    ];
    return (
      <div className="space-y-2">
        <label htmlFor="card-entity" className="block font-medium">
          {t.entity}
        </label>
        <Select
          value={card.entity_id}
          onValueChange={(entity_id) =>
            dispatch({ type: "edit-card", card: { ...card, entity_id } })
          }
        >
          <SelectTrigger id="card-entity" className="min-h-11 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {ids.map((id) => (
              <SelectItem key={id} value={id}>
                {entityName(hass, id)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (card.type !== "entities") return null;
  return (
    <>
      <div className="space-y-2">
        <label htmlFor="card-title" className="block font-medium">
          {t.title}
        </label>
        <Input
          id="card-title"
          value={card.title}
          onChange={(event) =>
            dispatch({
              type: "edit-card",
              card: { ...card, title: event.target.value },
            })
          }
        />
      </div>
      {card.entity_ids.length > 0 && (
        <div className="divide-y rounded-xl border">
          {card.entity_ids.map((id, index) => (
            <div key={`${index}-${id}`} className="flex items-center gap-1 p-2">
              <span className="min-w-0 flex-1 break-words">
                {entityName(hass, id)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`${t.moveUp} ${entityName(hass, id)}`}
                disabled={index === 0}
                onClick={() =>
                  dispatch({
                    type: "entity-reorder",
                    id: card.id,
                    from: index,
                    to: index - 1,
                  })
                }
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`${t.moveDown} ${entityName(hass, id)}`}
                disabled={index === card.entity_ids.length - 1}
                onClick={() =>
                  dispatch({
                    type: "entity-reorder",
                    id: card.id,
                    from: index,
                    to: index + 1,
                  })
                }
              >
                <ArrowDown />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                aria-label={`${t.removeEntity} ${entityName(hass, id)}`}
                onClick={() =>
                  dispatch({ type: "entity-remove", id: card.id, index })
                }
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Button
        variant="outline"
        disabled={card.entity_ids.length >= 500}
        onClick={() => setAdding(!adding)}
        aria-expanded={adding}
      >
        <Plus />
        {t.addEntity}
      </Button>
      {adding && (
        <Command className="h-auto shrink-0 rounded-xl border">
          <CommandInput
            placeholder={t.searchEntities}
            aria-label={t.searchEntities}
          />
          <CommandList>
            <CommandEmpty>{t.noEntities}</CommandEmpty>
            {Object.keys(hass.states)
              .filter((id) => !card.entity_ids.includes(id))
              .sort((a, b) =>
                entityName(hass, a).localeCompare(
                  entityName(hass, b),
                  hass.language,
                ),
              )
              .map((id) => (
                <CommandItem
                  key={id}
                  value={id}
                  keywords={[entityName(hass, id)]}
                  className="min-h-11"
                  onSelect={() => {
                    dispatch({ type: "entity-add", id: card.id, entityId: id });
                    setAdding(false);
                  }}
                >
                  {entityName(hass, id)}
                </CommandItem>
              ))}
          </CommandList>
        </Command>
      )}
    </>
  );
}

function RoomOptions({
  room,
  hass,
  dispatch,
}: {
  room: RoomConfig;
  hass: HassLike;
  dispatch: (action: ConfigEditorAction) => void;
}) {
  const t = messages(hass.language);
  return (
    <>
      {climateSensors.map(({ key, deviceClass, label }) => {
        const sensors = Object.keys(hass.states)
          .filter(
            (id) =>
              id.startsWith("sensor.") &&
              hass.states[id].attributes.device_class === deviceClass,
          )
          .sort((a, b) =>
            entityName(hass, a).localeCompare(
              entityName(hass, b),
              hass.language,
            ),
          );
        const local = sensors.filter(
          (id) => entityArea(hass, id) === room.area_id,
        );
        const other = sensors.filter(
          (id) => entityArea(hass, id) !== room.area_id,
        );
        const selected = room[key];
        const option = (id: string) => (
          <SelectItem key={id} value={id}>
            {entityName(hass, id)} · {entityValue(hass, id)}
          </SelectItem>
        );
        return (
          <div key={key} className="space-y-2">
            <label htmlFor={`room-${key}`} className="block font-medium">
              {t[label]}
            </label>
            <Select
              value={selected ?? "automatic"}
              onValueChange={(id) =>
                dispatch({
                  type: "edit-room",
                  room: { ...room, [key]: id === "automatic" ? null : id },
                })
              }
            >
              <SelectTrigger id={`room-${key}`} className="min-h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="automatic">{t.automatic}</SelectItem>
                {!!local.length && (
                  <SelectGroup>
                    <SelectLabel>{t.inRoom}</SelectLabel>
                    {local.map(option)}
                  </SelectGroup>
                )}
                {!!other.length && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>{t.otherSensors}</SelectLabel>
                      {other.map(option)}
                    </SelectGroup>
                  </>
                )}
                {selected && !sensors.includes(selected) && option(selected)}
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </>
  );
}
