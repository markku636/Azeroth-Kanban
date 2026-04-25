'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  closestCorners,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { CardStatus } from '@prisma/client';
import { useTranslation } from '@/hooks/use-translation';
import { useConfirm } from '@/hooks/use-confirm';
import { CARD_STATUS_ORDER } from './_lib/card-status';
import { useKanbanBoard, type CardDto } from './_lib/use-kanban-board';
import { InlineCardForm } from './_components/inline-card-form';
import { KanbanColumn } from './_components/kanban-column';
import { KanbanCard } from './_components/kanban-card';
import { EditCardModal } from './_components/edit-card-modal';

export default function KanbanPage() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { board, loading, addCard, updateCard, deleteCard, moveCard } = useKanbanBoard();
  const [activeCard, setActiveCard] = useState<CardDto | null>(null);
  const [editing, setEditing] = useState<CardDto | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const cardIndex = useMemo(() => {
    const map = new Map<string, { status: CardStatus; index: number }>();
    for (const status of CARD_STATUS_ORDER) {
      board[status].forEach((c, i) => map.set(c.id, { status, index: i }));
    }
    return map;
  }, [board]);

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    const found = cardIndex.get(id);
    if (found) setActiveCard(board[found.status][found.index] ?? null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveCard(null);
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const fromInfo = cardIndex.get(activeId);
    if (!fromInfo) return;

    // 解析目標 column 與 index
    let toStatus: CardStatus | null = null;
    let toIndex = 0;

    if (overId.startsWith('column-')) {
      // drop 到欄空白處 → 末端
      toStatus = overId.replace('column-', '') as CardStatus;
      toIndex = board[toStatus].length;
    } else {
      const overInfo = cardIndex.get(overId);
      if (!overInfo) return;
      toStatus = overInfo.status;
      toIndex = overInfo.index;
      // 同欄拖到自己後面 → index 需要調整為「移除自己後再插入」
      if (fromInfo.status === toStatus && fromInfo.index < overInfo.index) {
        // dnd-kit drop on item 表示「插在該 item 之前」；同欄下移時要 +1 才算「之後」
        // 但因為 useKanbanBoard.moveCard 內部會先 remove 自己再 insert，這裡傳遞要求位置即可
        // 故不調整 toIndex；拿掉自己後 overInfo.index 就會自動往前 1（對齊我們在 moveCard 處理的邏輯）
      }
    }
    if (!toStatus) return;

    await moveCard(activeId, toStatus, toIndex);
  };

  const handleDelete = async (card: CardDto) => {
    const ok = await confirm({
      title: t('common.confirm'),
      message: t('admin.kanban.deleteConfirm', { title: card.title }),
      type: 'danger',
    });
    if (!ok) return;
    await deleteCard(card.id);
  };

  return (
    <div className="flex h-full flex-col p-4 sm:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('admin.kanban.title')}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('admin.kanban.description')}</p>
      </div>

      <div className="mb-4">
        <InlineCardForm onSubmit={addCard} disabled={loading} />
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-r-transparent" />
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-1 flex-row gap-3 overflow-x-auto pb-2 snap-x snap-mandatory lg:grid lg:grid-cols-4 lg:overflow-x-visible lg:snap-none">
            {CARD_STATUS_ORDER.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                cards={board[status]}
                onEdit={(c) => setEditing(c)}
                onDelete={handleDelete}
              />
            ))}
          </div>
          <DragOverlay>
            {activeCard ? (
              <KanbanCard card={activeCard} onEdit={() => {}} onDelete={() => {}} isOverlay />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <EditCardModal
        card={editing}
        onClose={() => setEditing(null)}
        onSubmit={async (id, patch) => {
          return await updateCard(id, patch);
        }}
      />
    </div>
  );
}
