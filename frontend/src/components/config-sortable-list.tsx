import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, GripVertical } from "lucide-react";
import { messages } from "../i18n";
import { usePortalContainer } from "../portal-container";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";

type Row = {
  id: string;
  title: string;
  description?: string;
  hidden?: boolean;
};

export function ConfigSortableList({
  rows,
  language,
  onMove,
  onToggle,
  onEdit,
}: {
  rows: Row[];
  language: string;
  onMove: (from: number, to: number) => void;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const t = messages(language);
  const container = usePortalContainer();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{
        container,
        screenReaderInstructions: { draggable: t.dragInstructions },
        announcements: {
          onDragStart: () => t.dragPickedUp,
          onDragOver: () => t.dragMoved,
          onDragEnd: () => t.dragDropped,
          onDragCancel: () => t.dragCancelled,
        },
      }}
      onDragEnd={({ active, over }) => {
        if (over && active.id !== over.id)
          onMove(
            rows.findIndex((row) => row.id === active.id),
            rows.findIndex((row) => row.id === over.id),
          );
      }}
    >
      <SortableContext
        items={rows.map((row) => row.id)}
        strategy={verticalListSortingStrategy}
      >
        {rows.map((row) => (
          <SortableRow
            key={row.id}
            row={row}
            language={language}
            onToggle={() => onToggle(row.id)}
            onEdit={() => onEdit(row.id)}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  row,
  language,
  onToggle,
  onEdit,
}: {
  row: Row;
  language: string;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const t = messages(language);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id });
  return (
    <div
      ref={setNodeRef}
      role="listitem"
      data-config-row={row.id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`relative flex items-center gap-1 border-b bg-card px-1 last:border-b-0 ${row.hidden ? "text-muted-foreground" : "text-card-foreground"} ${isDragging ? "z-10 shadow-lg" : ""}`}
    >
      <Button
        ref={setActivatorNodeRef}
        variant="ghost"
        className="size-11 touch-none text-muted-foreground"
        {...attributes}
        {...listeners}
        data-drag-handle
        aria-roledescription={t.reorder}
        aria-label={`${t.reorder} ${row.title}`}
      >
        <GripVertical className="size-4" />
      </Button>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`${t.editItem} ${row.title}`}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-2 rounded-md py-3 text-left outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{row.title}</span>
          {row.description && (
            <span className="block text-sm text-muted-foreground">
              {row.description}
            </span>
          )}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </button>
      <div className="switch-target flex items-center">
        <Switch
          checked={!row.hidden}
          onCheckedChange={onToggle}
          aria-label={`${t.show} ${row.title}`}
        />
      </div>
    </div>
  );
}
