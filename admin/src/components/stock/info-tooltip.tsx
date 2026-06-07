'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface InfoTooltipProps {
  /** 無障礙標籤，預設「說明」 */
  label?: string;
  /** 浮窗內容 */
  children: ReactNode;
}

/** 浮窗寬度（對應 w-56 = 224px）的一半，用於水平 clamp 不超出視窗。 */
const TOOLTIP_HALF_WIDTH = 112;
/** 浮窗與視窗邊緣 / 觸發點的安全間距（px）。 */
const TOOLTIP_MARGIN = 8;
/** 估算浮窗高度，用於判斷下方空間是否足夠（不足則往上翻）。 */
const TOOLTIP_EST_HEIGHT = 120;

interface TooltipCoords {
  top: number;
  left: number;
  above: boolean;
}

/**
 * 說明浮窗：桌機滑過、鍵盤聚焦皆可顯示（無額外 UI 依賴）。
 * 浮窗以 portal 掛到 `document.body`、`position: fixed` 依觸發點定位，
 * 脫離表格 `overflow` 裁切（修正「滑鼠移過去被容器擋住」）。
 */
export function InfoTooltip({ label = '說明', children }: InfoTooltipProps) {
  const [coords, setCoords] = useState<TooltipCoords | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const tipId = useId();

  const show = () => {
    const el = btnRef.current;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const left = Math.max(
      TOOLTIP_HALF_WIDTH + TOOLTIP_MARGIN,
      Math.min(center, window.innerWidth - TOOLTIP_HALF_WIDTH - TOOLTIP_MARGIN),
    );
    const above = rect.bottom + TOOLTIP_EST_HEIGHT > window.innerHeight;
    const top = above ? rect.top - TOOLTIP_MARGIN : rect.bottom + TOOLTIP_MARGIN;
    setCoords({ top, left, above });
  };
  const hide = () => setCoords(null);

  return (
    <span className="ml-1 inline-block align-middle">
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-describedby={coords ? tipId : undefined}
        className="cursor-help rounded-full border border-gray-300 px-1 text-[10px] leading-none text-gray-500 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        ⓘ
      </button>
      {coords
        ? createPortal(
            <span
              id={tipId}
              role="tooltip"
              // 位置由 getBoundingClientRect 於執行期算出，必須用 inline style（無法以靜態 class 表達）
              style={{
                top: coords.top,
                left: coords.left,
                transform: coords.above ? 'translate(-50%, -100%)' : 'translateX(-50%)',
              }}
              className="fixed z-[1000] w-56 max-w-[80vw] rounded-lg border bg-white p-2.5 text-left text-xs font-normal leading-relaxed text-gray-600 shadow-lg dark:bg-gray-800 dark:text-gray-300"
            >
              {children}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
