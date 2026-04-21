import NextLink from 'next/link';
import { type ComponentProps } from 'react';

type LinkProps = ComponentProps<typeof NextLink>;

/**
 * 封裝 next/link，預設關閉 prefetch。
 *
 * Next.js 的 Link 預設 prefetch={true}，在列表中每筆資料都會觸發一次 prefetch，
 * 造成大量不必要的網路請求。此元件將預設值改為 false，需要 prefetch 時再明確傳入。
 *
 * @example
 * // 列表中使用（不 prefetch）
 * <Link href={routes.admin.agents.detail(id)}>{name}</Link>
 *
 * // 需要 prefetch 時明確啟用
 * <Link href={routes.admin.dashboard} prefetch>Dashboard</Link>
 */
export default function Link({ prefetch = false, ...props }: LinkProps) {
  return <NextLink prefetch={prefetch} {...props} />;
}
