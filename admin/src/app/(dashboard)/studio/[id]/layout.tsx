import type { ReactNode } from 'react';
import { StudioStageTabs } from './_components/studio-stage-tabs';
import { AgentLauncher } from './_components/agent-launcher';

// 專案層共用框：頂部導引分頁（故事設定→腳本→分鏡→生成）＋右下角主動 AI 助手，下方為各階段頁。
export default function StudioProjectLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <StudioStageTabs />
      <div className="min-h-0 flex-1">{children}</div>
      <AgentLauncher />
    </div>
  );
}
