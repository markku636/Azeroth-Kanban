export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 32, lineHeight: 1.6 }}>
      <h1>Selkie Sim Service</h1>
      <p>模擬微服務 —— 會被注入故障,並產生真實的結構化 JSON 日誌供 Selkie 調查。</p>
      <ul>
        <li>
          <code>GET /api/health</code> —— 健康檢查
        </li>
        <li>
          <code>GET /api/work</code> —— 模擬業務請求(套用當前故障模式)
        </li>
        <li>
          <code>GET / POST /api/chaos</code> —— 查詢 / 設定故障模式
        </li>
      </ul>
      <p>
        故障模式:<code>none</code> / <code>memory-leak</code> / <code>error-5xx</code> /{' '}
        <code>slow</code> / <code>cpu-spin</code> / <code>crash</code>
      </p>
    </main>
  );
}
