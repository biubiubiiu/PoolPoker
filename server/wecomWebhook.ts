import type { ServerRoom } from '../shared/types/game';
import { getRobotWebhookUrl } from './robotConfig';

// 固定提及成员
const WECOM_MENTIONED_LIST = ['shyren'];

interface WecomTextMessage {
  msgtype: 'text';
  text: {
    content: string;
    mentioned_list: string[];
  };
}

// 每局胜利后，将房间号、各成员本局得分以及当前累计积分推送到企业微信机器人
export async function sendRoundResultToWecom(room: ServerRoom): Promise<void> {
  const webhookUrl = getRobotWebhookUrl();
  if (!webhookUrl) return; // 未配置机器人链接，不发送

  const memberLines = room.players.map((p) => {
    const roundDelta = (room.lastRoundScores || []).find((rs) => rs.userId === p.userId)?.delta ?? 0;
    const deltaText = roundDelta >= 0 ? `+${roundDelta}` : `${roundDelta}`;
    return `成员${p.name}：${deltaText}（累计${p.totalScore || 0}）`;
  });

  const content = `房间号：${room.code}\n${memberLines.join('\n')}`;

  const message: WecomTextMessage = {
    msgtype: 'text',
    text: {
      content,
      mentioned_list: WECOM_MENTIONED_LIST,
    },
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    if (!res.ok) {
      console.warn(`⚠️ [WeCom] 推送本局结果失败 (房间 ${room.code}, HTTP ${res.status})`);
      return;
    }

    const result = (await res.json()) as { errcode?: number; errmsg?: string };
    if (result.errcode !== 0) {
      console.warn(`⚠️ [WeCom] 推送本局结果失败 (房间 ${room.code}): ${result.errcode} ${result.errmsg ?? ''}`);
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`⚠️ [WeCom] 推送本局结果异常 (房间 ${room.code}): ${reason}`);
  }
}
