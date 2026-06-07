/**
 * Worker 環境設定 — 從 process.env 讀取並提供型別化存取。
 *
 * 設計原則：金鑰一律由環境變數注入，絕不寫死。缺值時對「必要設定」拋錯，
 * 對「選配設定」回傳 undefined 由呼叫端決定降級行為。
 */

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : undefined;
}

function required(name: string): string {
  const v = optional(name);
  if (!v) throw new Error(`[config] 缺少必要環境變數：${name}`);
  return v;
}

export const config = {
  databaseUrl: required('DATABASE_URL'),

  redis: {
    host: optional('REDIS_HOST') ?? 'localhost',
    port: Number(optional('REDIS_PORT') ?? '6379'),
  },

  finmind: {
    token: optional('FINMIND_TOKEN'),
    baseUrl: 'https://api.finmindtrade.com/api/v4/data',
  },

  fugle: {
    apiKey: optional('FUGLE_API_KEY'),
  },

  claude: {
    apiKey: optional('ANTHROPIC_API_KEY'),
    oauthToken: optional('CLAUDE_CODE_OAUTH_TOKEN'),
  },

  line: {
    channelSecret: optional('LINE_CHANNEL_SECRET'),
    channelAccessToken: optional('LINE_CHANNEL_ACCESS_TOKEN'),
    publicAssetBaseUrl: optional('PUBLIC_ASSET_BASE_URL'),
  },

  push: {
    // 強訊號自動推播的信心門檻
    minConfidence: Number(optional('PUSH_MIN_CONFIDENCE') ?? '0.5'),
  },
} as const;
