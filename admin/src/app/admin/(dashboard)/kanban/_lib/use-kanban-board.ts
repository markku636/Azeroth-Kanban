'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CardStatus } from '@prisma/client';
import toast from 'react-hot-toast';
import { useTranslation } from '@/hooks/use-translation';
import { tApiError } from '@/lib/translate-api-error';
import { CARD_STATUS_ORDER } from './card-status';

export interface CardDto {
  id: string;
  title: string;
  description: string | null;
  status: CardStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type Board = Record<CardStatus, CardDto[]>;

const emptyBoard = (): Board => ({
  TODO: [],
  IN_PROGRESS: [],
  IN_REVIEW: [],
  DONE: [],
});

const cloneBoard = (board: Board): Board => ({
  TODO: [...board.TODO],
  IN_PROGRESS: [...board.IN_PROGRESS],
  IN_REVIEW: [...board.IN_REVIEW],
  DONE: [...board.DONE],
});

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  errorCode?: string;
  errorParams?: Record<string, unknown>;
  data?: T;
}

async function apiCall<T>(url: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    return (await res.json()) as ApiEnvelope<T>;
  } catch (e) {
    console.error('[useKanbanBoard] fetch failed', { url }, e);
    return { success: false, message: 'network_error' };
  }
}

export function useKanbanBoard() {
  const { t } = useTranslation();
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [loading, setLoading] = useState(true);

  const loadBoard = useCallback(async () => {
    setLoading(true);
    const res = await apiCall<Board>('/api/v1/kanban/cards');
    if (res.success && res.data) {
      // 確保四欄都存在（後端應回完整結構，這裡保險）
      setBoard({
        TODO: res.data.TODO ?? [],
        IN_PROGRESS: res.data.IN_PROGRESS ?? [],
        IN_REVIEW: res.data.IN_REVIEW ?? [],
        DONE: res.data.DONE ?? [],
      });
    } else {
      toast.error(tApiError(res, t, 'admin.kanban.loadFailed'));
    }
    setLoading(false);
  }, [t]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const addCard = useCallback(
    async (title: string, description?: string) => {
      const res = await apiCall<CardDto>('/api/v1/kanban/cards', {
        method: 'POST',
        body: JSON.stringify({ title, description }),
      });
      if (res.success && res.data) {
        const card = res.data;
        setBoard((prev) => ({ ...prev, TODO: [...prev.TODO, card] }));
        toast.success(t('admin.kanban.createSuccess'));
        return true;
      }
      toast.error(tApiError(res, t, 'admin.kanban.createFailed'));
      return false;
    },
    [t]
  );

  const updateCard = useCallback(
    async (id: string, patch: { title?: string; description?: string | null; status?: CardStatus }) => {
      const previous = cloneBoard(board);
      // optimistic：在所有欄裡找出並更新
      setBoard((prev) => {
        const next = cloneBoard(prev);
        for (const status of CARD_STATUS_ORDER) {
          const idx = next[status].findIndex((c) => c.id === id);
          if (idx >= 0) {
            next[status][idx] = { ...next[status][idx], ...patch } as CardDto;
            break;
          }
        }
        return next;
      });

      const res = await apiCall<CardDto>(`/api/v1/kanban/cards/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      if (res.success && res.data) {
        // 若改了 status，後端會放到新欄末端；重新 load 以同步 sortOrder
        if (patch.status) {
          await loadBoard();
        }
        toast.success(t('admin.kanban.updateSuccess'));
        return true;
      }
      setBoard(previous);
      toast.error(tApiError(res, t, 'admin.kanban.updateFailed'));
      return false;
    },
    [board, loadBoard, t]
  );

  const deleteCard = useCallback(
    async (id: string) => {
      const previous = cloneBoard(board);
      setBoard((prev) => {
        const next = cloneBoard(prev);
        for (const status of CARD_STATUS_ORDER) {
          next[status] = next[status].filter((c) => c.id !== id);
        }
        return next;
      });

      const res = await apiCall<{ id: string }>(`/api/v1/kanban/cards/${id}`, {
        method: 'DELETE',
      });
      if (res.success) {
        toast.success(t('admin.kanban.deleteSuccess'));
        return true;
      }
      setBoard(previous);
      toast.error(tApiError(res, t, 'admin.kanban.deleteFailed'));
      return false;
    },
    [board, t]
  );

  /**
   * 拖拉移動
   * @param id 被拖卡片 id
   * @param toStatus 目標欄
   * @param targetIndex 在目標欄中要插入的 index（0 為最頂端）
   */
  const moveCard = useCallback(
    async (id: string, toStatus: CardStatus, targetIndex: number) => {
      const previous = cloneBoard(board);
      // 取移動的 card
      let movedCard: CardDto | undefined;
      const optimistic: Board = cloneBoard(board);
      for (const status of CARD_STATUS_ORDER) {
        const idx = optimistic[status].findIndex((c) => c.id === id);
        if (idx >= 0) {
          movedCard = optimistic[status][idx];
          optimistic[status] = [
            ...optimistic[status].slice(0, idx),
            ...optimistic[status].slice(idx + 1),
          ];
          break;
        }
      }
      if (!movedCard) return false;

      // 計算 beforeId / afterId（目標欄移除自己後）
      const targetCol = optimistic[toStatus];
      const safeIndex = Math.max(0, Math.min(targetIndex, targetCol.length));
      const beforeCard = safeIndex > 0 ? targetCol[safeIndex - 1] : null;
      const afterCard = safeIndex < targetCol.length ? targetCol[safeIndex] : null;

      const newCard: CardDto = { ...movedCard, status: toStatus };
      optimistic[toStatus] = [
        ...targetCol.slice(0, safeIndex),
        newCard,
        ...targetCol.slice(safeIndex),
      ];
      setBoard(optimistic);

      const res = await apiCall<{ id: string; status: CardStatus; sortOrder: number }>(
        `/api/v1/kanban/cards/${id}/move`,
        {
          method: 'POST',
          body: JSON.stringify({
            status: toStatus,
            beforeId: beforeCard?.id ?? null,
            afterId: afterCard?.id ?? null,
          }),
        }
      );
      if (res.success && res.data) {
        // 同步真實 sortOrder（保險，避免 normalize 後不一致）
        await loadBoard();
        toast.success(t('admin.kanban.moveSuccess', { status: t(`admin.kanban.status${capitalize(toStatus)}`) }));
        return true;
      }
      setBoard(previous);
      toast.error(tApiError(res, t, 'admin.kanban.moveFailed'));
      return false;
    },
    [board, loadBoard, t]
  );

  return { board, loading, loadBoard, addCard, updateCard, deleteCard, moveCard };
}

function capitalize(s: string): string {
  // 'IN_PROGRESS' → 'InProgress'
  return s
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}
