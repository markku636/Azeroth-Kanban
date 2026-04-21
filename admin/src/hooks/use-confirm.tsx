'use client';

import { useModal } from '@/app/shared/modal-views/use-modal';
import { ConfirmDialogBody, type ConfirmDialogType } from '@/components/confirm-dialog-body';

export interface ConfirmOptions {
  title: string;
  message: string;
  type?: ConfirmDialogType;
  confirmLabel?: string;
  cancelLabel?: string;
}

/**
 * 取代 `window.confirm()`；透過全域 Modal 系統顯示自訂 ConfirmDialog。
 *
 * @example
 * const confirm = useConfirm();
 * if (!(await confirm({ title: '確定刪除', message: '...', type: 'danger' }))) return;
 */
export function useConfirm() {
  const { openModal, closeModal } = useModal();

  return (opts: ConfirmOptions): Promise<boolean> =>
    new Promise((resolve) => {
      openModal({
        size: 'sm',
        view: (
          <ConfirmDialogBody
            title={opts.title}
            message={opts.message}
            type={opts.type}
            confirmLabel={opts.confirmLabel}
            cancelLabel={opts.cancelLabel}
            onConfirm={() => {
              closeModal();
              resolve(true);
            }}
            onCancel={() => {
              closeModal();
              resolve(false);
            }}
          />
        ),
      });
    });
}
