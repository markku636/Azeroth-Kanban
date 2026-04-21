import { Metadata } from 'next';
import { LAYOUT_OPTIONS } from '@/config/enums';
import { OpenGraph } from 'next/dist/lib/metadata/types/opengraph-types';

enum MODE {
  DARK = 'dark',
  LIGHT = 'light',
}

export const siteConfig = {
  title: 'VOAI MGM 管理後台',
  description: 'VOAI MGM（Member-Get-Member）推廣系統管理後台',
  mode: MODE.LIGHT,
  layout: LAYOUT_OPTIONS.HYDROGEN,
};

export const metaObject = (
  title?: string,
  openGraph?: OpenGraph,
  description: string = siteConfig.description
): Metadata => {
  return {
    title: title ? `${title} - VOAI MGM` : siteConfig.title,
    description,
    openGraph: openGraph ?? {
      title: title ? `${title} - VOAI MGM` : title,
      description,
      locale: 'zh_TW',
      type: 'website',
    },
  };
};
