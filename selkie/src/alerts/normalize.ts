/**
 * 告警正規化 —— 把不同來源的 webhook payload 轉成統一的 Incident。
 *
 * 支援:generic(已接近 Incident 形狀)、pagerduty(v3 webhook)、alertmanager。
 * 解析一律防禦性處理,缺欄位就給合理預設,避免 webhook 因格式而中斷。
 */
import type { Incident } from "../schemas.js";

/** 安全地把 unknown 視為物件。 */
function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? (value as Record<string, any>) : {};
}

/** 在缺少 ID 時產生一個可讀的臨時 ID。 */
function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

/** generic:body 已大致是 Incident 形狀。 */
function fromGeneric(payload: unknown): Incident {
  const p = asRecord(payload);
  return {
    id: String(p.incidentId ?? p.id ?? generateId("INC")),
    title: String(p.title ?? p.summary ?? "未命名告警"),
    service: String(p.service ?? p.serviceName ?? "unknown"),
    source: "generic",
    status: String(p.status ?? "triggered"),
    triggeredAt: String(p.triggeredAt ?? p.timestamp ?? new Date().toISOString()),
    description: String(p.description ?? p.summary ?? p.title ?? ""),
    severityHint: p.severity ? String(p.severity) : undefined,
    links: Array.isArray(p.links) ? p.links.map(String) : undefined,
  };
}

/** PagerDuty v3 webhook:資料在 event.data 之下。 */
function fromPagerDuty(payload: unknown): Incident {
  const p = asRecord(payload);
  const data = asRecord(asRecord(p.event).data);
  const service = asRecord(data.service);
  return {
    id: String(data.id ?? data.incident_number ?? generateId("PD")),
    title: String(data.title ?? "PagerDuty incident"),
    service: String(service.summary ?? service.name ?? "unknown"),
    source: "pagerduty",
    status: String(data.status ?? "triggered"),
    triggeredAt: String(data.created_at ?? new Date().toISOString()),
    description: String(data.description ?? data.title ?? ""),
    severityHint: data.urgency ? String(data.urgency) : undefined,
    links: data.html_url ? [String(data.html_url)] : undefined,
  };
}

/** Prometheus Alertmanager webhook:取第一筆 alert。 */
function fromAlertmanager(payload: unknown): Incident {
  const p = asRecord(payload);
  const alerts = Array.isArray(p.alerts) ? p.alerts : [];
  const first = asRecord(alerts[0]);
  const labels = asRecord(first.labels);
  const annotations = asRecord(first.annotations);
  return {
    id: generateId("AM"),
    title: String(annotations.summary ?? labels.alertname ?? "Alertmanager alert"),
    service: String(labels.service ?? labels.job ?? labels.namespace ?? "unknown"),
    source: "alertmanager",
    status: String(p.status ?? first.status ?? "triggered"),
    triggeredAt: String(first.startsAt ?? new Date().toISOString()),
    description: String(annotations.description ?? annotations.summary ?? ""),
    severityHint: labels.severity ? String(labels.severity) : undefined,
  };
}

/** 依來源正規化告警 payload。 */
export function normalizeAlert(source: string, payload: unknown): Incident {
  switch (source.toLowerCase()) {
    case "pagerduty":
      return fromPagerDuty(payload);
    case "alertmanager":
      return fromAlertmanager(payload);
    default:
      return fromGeneric(payload);
  }
}
