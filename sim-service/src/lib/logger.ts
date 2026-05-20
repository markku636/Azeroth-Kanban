/**
 * 結構化 JSON 日誌 —— 每行一筆 JSON 輸出到 stdout。
 * filebeat 會收集容器 stdout、解析 JSON、送進 Elasticsearch。
 */

const SERVICE = process.env.SERVICE_NAME ?? 'sim-service';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogFields {
  route?: string;
  status?: number;
  durationMs?: number;
  chaos?: string;
  [key: string]: unknown;
}

/** 輸出一行結構化 JSON 日誌。 */
export function log(level: LogLevel, msg: string, fields: LogFields = {}): void {
  const entry = {
    '@timestamp': new Date().toISOString(),
    level,
    service: SERVICE,
    msg,
    ...fields,
  };
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

export const serviceName = SERVICE;
