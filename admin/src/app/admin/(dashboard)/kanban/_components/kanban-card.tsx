'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PiPencilBold, PiTrashBold } from 'react-icons/pi';
import type { CardDto } from '../_lib/use-kanban-board';

interface KanbanCardProps {
  card: CardDto;
  onEdit: (card: CardDto) => void;
  onDelete: (card: CardDto) => void;
  isOverlay?: boolean;
  readOnly?: boolean;
}

export function KanbanCard({ card, onEdit, onDelete, isOverlay, readOnly }: KanbanCardProps) {
  const sortable = useSortable({
    id: card.id,
    data: { card },
    disabled: readOnly,
  });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && !isOverlay ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(readOnly ? {} : listeners)}
      className={`group relative rounded-md border bg-gray-0 dark:bg-gray-100 p-3 shadow-sm transition-shadow ${
        isOverlay ? 'border-blue-400 shadow-lg ring-2 ring-blue-200 dark:ring-blue-900' : 'border-gray-200 hover:shadow-md'
      } ${readOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
    >
      <div className="pr-12">
        <h3 className="break-words text-sm font-semibold text-gray-900">
          {card.title}
        </h3>
        {card.description && (
          <p className="mt-1 break-words text-xs text-gray-500 line-clamp-3">
            {card.description}
          </p>
        )}
      </div>

      {!readOnly && !isOverlay && (
        <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(card);
            }}
            className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20 dark:hover:text-blue-400"
            aria-label="edit"
          >
            <PiPencilBold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(card);
            }}
            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            aria-label="delete"
          >
            <PiTrashBold className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
