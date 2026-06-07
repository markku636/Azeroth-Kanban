/**
 * LINE Messaging API webhook。
 *
 * 流程：取原始 body → 驗簽（HMAC-SHA256）→ 解析事件 →
 *       upsert LineSubscriber → 文字訊息走共用 runCommand → reply。
 *
 * 注意：必須先 request.text() 取原始 bytes 再驗簽，不可先 json()。
 */
import { NextResponse, type NextRequest } from 'next/server';
import { validateSignature, type webhook } from '@line/bot-sdk';
import { prisma } from '@/lib/prisma';
import { runCommand } from '@/lib/stock-service';
import { replyText } from '@/lib/line-reply';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelSecret) {
    return NextResponse.json({ error: 'LINE 未設定' }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-line-signature') ?? '';
  if (!validateSignature(rawBody, channelSecret, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let events: webhook.Event[] = [];
  try {
    events = (JSON.parse(rawBody) as webhook.CallbackRequest).events ?? [];
  } catch {
    return NextResponse.json({ error: 'Bad payload' }, { status: 400 });
  }

  for (const event of events) {
    if (event.type !== 'message' || event.message.type !== 'text') {
      continue;
    }
    const userId = event.source?.type === 'user' ? event.source.userId : undefined;
    const replyToken = event.replyToken;
    if (!replyToken) {
      continue;
    }

    // upsert 訂閱者並取得綁定的 member
    let memberId: string | null = null;
    if (userId) {
      const sub = await prisma.lineSubscriber.upsert({
        where: { lineUserId: userId },
        update: {},
        create: { lineUserId: userId },
      });
      memberId = sub.memberId;
    }

    const text = event.message.text.trim();
    // /watch 需綁定 member
    if (/^\/watch\b/i.test(text) && !memberId) {
      await replyText(
        replyToken,
        '請先於後台綁定您的 LINE 帳號後，才能使用關注清單功能。\n您仍可使用 /signal、/report、/gainers。',
      );
      continue;
    }

    const res = await runCommand(memberId ?? '', text);
    await replyText(replyToken, res.data?.reply ?? res.message);
  }

  return NextResponse.json({ ok: true });
}
