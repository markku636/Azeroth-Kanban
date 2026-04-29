'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PiPencilBold, PiTrashBold, PiUserBold } from 'react-icons/pi';
import { useTranslation } from '@/hooks/use-translation';
import type { CardDto } from '../_lib/use-kanban-board';

interface KanbanCardProps {
  card: CardDto;
  onEdit: (card: CardDto) => void;
  onDelete: (card: CardDto) => void;
  isOverlay?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  isOwn?: boolean;
}

const OWNER_PALETTE = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-violet-100 text-violet-700',
  'bg-cyan-100 text-cyan-700',
];

function ownerColor(ownerId: string): string {
  let hash = 0;
  for (let i = 0; i < ownerId.length; i++) {
    hash = (hash * 31 + ownerId.charCodeAt(i)) | 0;
  }
  return OWNER_PALETTE[Math.abs(hash) % OWNER_PALETTE.length];
}

function ownerInitial(owner: CardDto['owner']): string {
  const source = owner.name?.trim() || owner.email;
  return source.charAt(0).toUpperCase() || '?';
}

export function KanbanCard({
  card,
  onEdit,
  onDelete,
  isOverlay,
  canEdit = false,
  canDelete = false,
  isOwn = false,
}: KanbanCardProps) {
  const { t } = useTranslation();
  const draggable = canEdit;
  const sortable = useSortable({
    id: card.id,
    data: { card },
    disabled: !draggable,
  });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && !isOverlay ? 0.4 : 1,
  };

  const showActionsArea = !isOverlay && (canEdit || canDelete);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(draggable ? listeners : {})}
      className={`group relative rounded-md border bg-gray-0 dark:bg-gray-100 p-3 shadow-sm transition-shadow ${
        isOverlay
          ? 'border-blue-400 shadow-lg ring-2 ring-blue-200 dark:ring-blue-900'
          : 'border-gray-200 hover:shadow-md'
      } ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
    >
      <div className={showActionsArea ? 'pr-24' : ''}>
        <h3 className="break-words text-sm font-semibold text-gray-900">{card.title}</h3>
        {card.description && (
          <p className="mt-1 break-words text-xs text-gray-500 line-clamp-3">{card.description}</p>
        )}
      </div>

      {/* Owner */}
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-500">
        <span
          className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${ownerColor(card.owner.id)}`}
          aria-hidden
        >
          {ownerInitial(card.owner)}
        </span>
        <PiUserBold className="h-3 w-3 opacity-60" aria-hidden />
        <span className="truncate" title={card.owner.email}>
          {card.owner.name?.trim() || card.owner.email}
        </span>
        {isOwn && (
          <span className="ml-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            {t('admin.kanban.ownerYou')}
          </span>
        )}
      </div>

      {showActionsArea && (
        <div className="absolute right-1 top-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {canEdit && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onEdit(card);
              }}
              className="flex h-11 w-11 items-center justify-center rounded text-gray-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20 dark:hover:text-blue-400"
              aria-label="edit"
            >
              <PiPencilBold className="h-4 w-4" />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(card);
              }}
              className="flex h-11 w-11 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
              aria-label="delete"
            >
              <PiTrashBold className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
