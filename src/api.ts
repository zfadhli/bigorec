import type { StreamInfo } from './types.js';

const API_URL = 'https://ta.bigo.tv/official_website/studio/getInternalStudioInfo';

/** Extract siteId from a Bigo URL or raw ID */
export function parseSiteId(input: string): string {
  // https://www.bigo.tv/805516745 or bigo.tv/805516745 or just 805516745
  const match = input.match(/bigo\.tv(?:\/[a-z]{2,})?\/(?<id>[^/?#]+)/i);
  return match?.groups?.id ?? input.trim();
}

/** Fetch stream info for a siteId */
export async function getStreamInfo(siteId: string): Promise<StreamInfo> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new URLSearchParams({ siteId, verify: '' }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`API error: ${res.status}`);

    const json = (await res.json()) as {
      code: number;
      msg: string;
      data: {
        siteId: string;
        uid: string;
        sid: string;
        nick_name: string;
        roomTopic: string;
        alive: number;
        hls_src: string | null;
        snapshot: string | null;
        roomId: string;
      };
    };

    if (json.code !== 0) throw new Error(`API error: ${json.msg}`);
    if (!json.data?.siteId) throw new Error(`Unknown user: ${siteId}`);

    return {
      siteId: json.data.siteId,
      uid: json.data.uid,
      sid: json.data.sid,
      nickName: json.data.nick_name,
      roomTopic: json.data.roomTopic,
      alive: json.data.alive === 1,
      hlsSrc: json.data.hls_src,
      snapshot: json.data.snapshot,
      roomId: json.data.roomId,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Check if a room is currently live */
export async function isLive(siteId: string): Promise<boolean> {
  const info = await getStreamInfo(siteId);
  return info.alive && info.hlsSrc !== null;
}
