'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import {
  PiBookOpenTextDuotone, PiPencilSimpleLineDuotone, PiFilmSlateDuotone, PiPlayCircleDuotone, PiCaretRightBold,
} from 'react-icons/pi';

/**
 * 導引分頁（故事設定 → 腳本 → 分鏡 → 生成）。故事背景貫穿每一步；保留現有看板與拖曳。
 * 「分鏡」與「生成」都在看板頁操作：分鏡=排鏡，生成=按看板上的 ①生成圖片 / ②生成影片。
 */
export function StudioStageTabs() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const pathname = usePathname() ?? '';
  const board = `/studio/${id}`;
  const isStory = pathname.endsWith('/story');
  const isScript = pathname.endsWith('/script');
  const isBoard = pathname === board;

  const steps = [
    { key: 'story', label: '故事設定', href: `/studio/${id}/story`, icon: <PiBookOpenTextDuotone className="h-4 w-4" />, active: isStory },
    { key: 'script', label: '腳本', href: `/studio/${id}/script`, icon: <PiPencilSimpleLineDuotone className="h-4 w-4" />, active: isScript },
    { key: 'board', label: '分鏡', href: board, icon: <PiFilmSlateDuotone className="h-4 w-4" />, active: isBoard },
    { key: 'gen', label: '生成', href: board, icon: <PiPlayCircleDuotone className="h-4 w-4" />, active: false, accent: true },
  ];

  return (
    <nav className="flex items-center gap-1 overflow-x-auto border-b border-gray-200 px-2 py-2 dark:border-gray-200 sm:px-6">
      {steps.map((s, i) => (
        <Fragment key={s.key}>
          {i > 0 && <PiCaretRightBold className="h-3 w-3 flex-none text-gray-300" />}
          <Link
            href={s.href}
            className={
              'flex flex-none items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
              (s.active
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                : s.accent
                  ? 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30'
                  : 'text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-100')
            }
            title={s.accent ? '到看板按「① 生成圖片 / ② 生成影片」' : undefined}
          >
            {s.icon} {s.label}
          </Link>
        </Fragment>
      ))}
    </nav>
  );
}
