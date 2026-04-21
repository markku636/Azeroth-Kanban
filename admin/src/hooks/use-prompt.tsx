'use client';

import { useModal } from '@/app/shared/modal-views/use-modal';
import { PromptDialogBody } from '@/components/prompt-dialog-body';

export interface PromptOptions {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  required?: boolean;
}

/**
 * 取代 `window.prompt()`；透過全域 Modal 系統顯示自訂輸入對話框。
 *
 * @example
 * const prompt = usePrompt();
 * const month = await prompt({ title: '輸入月份', placeholder: 'YYYY-MM', required: true });
 * if (!month) return;
 */
export function usePrompt() {
  const { openModal, closeModal } = useModal();

  return (opts: PromptOptions): Promise<string | null> =>
    new Promise((resolve) => {
      openModal({
        size: 'sm',
        view: (
          <PromptDialogBody
            title={opts.title}
            message={opts.message}
            placeholder={opts.placeholder}
            defaultValue={opts.defaultValue}
            confirmLabel={opts.confirmLabel}
            cancelLabel={opts.cancelLabel}
            required={opts.required}
            onConfirm={(value) => {
              closeModal();
              resolve(value);
            }}
            onCancel={() => {
              closeModal();
              resolve(null);
            }}
          />
        ),
      });
    });
}
