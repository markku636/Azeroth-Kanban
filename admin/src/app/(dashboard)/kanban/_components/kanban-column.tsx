'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { CardStatus } from '@prisma/client';
import { useTranslation } from '@/hooks/use-translation';
import { CARD_STATUS_CONFIG } from '../_lib/card-status';
import type { CardDto } from '../_lib/use-kanban-board';
import { KanbanCard } from './kanban-card';

interface KanbanColumnProps {
  status: CardStatus;
  cards: CardDto[];
  onEdit: (card: CardDto) => void;
  onDelete: (card: CardDto) => void;
  readOnly?: boolean;
}

export function KanbanColumn({ status, cards, onEdit, onDelete, readOnly }: KanbanColumnProps) {
  const { t } = useTranslation();
  const config = CARD_STATUS_CONFIG[status];
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${status}`,
    data: { type: 'column', status },
  });

  return (
    <div className={`flex h-full min-h-[200px] min-w-[280px] flex-shrink-0 snap-start flex-col rounded-lg border lg:min-w-0 lg:flex-shrink ${config.bg} ${config.border}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-inherit px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-base">{config.emoji}</span>
          <h2 className="text-sm font-semibold text-gray-800">
            {t(config.labelKey)}
          </h2>
        </div>
        <span className="rounded-full bg-gray-0/60 px-2 py-0.5 text-xs font-medium text-gray-600">
          {cards.length}
        </span>
      </div>

      {/* Body */}
      <div
        ref={setNodeRef}
        className={`flex-1 overflow-y-auto p-2 transition-colors ${
          isOver ? 'bg-blue-50/70 dark:bg-blue-900/30' : ''
        }`}
      >
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {cards.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-gray-400">
                {t('admin.kanban.emptyColumn')}
              </p>
            )}
            {cards.map((card) => (
              <KanbanCard
                key={card.id}
                card={card}
                onEdit={onEdit}
                onDelete={onDelete}
                readOnly={readOnly}
              />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}
