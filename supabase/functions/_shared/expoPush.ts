/**
 * Expo Push delivery (T4.3). Free, 600/sec per Expo's own limits — no queue
 * needed at beta scale. Batches up to 100 tokens per Expo's documented
 * per-request cap. One dead token (uninstalled app, revoked permission)
 * reports in `failed` rather than throwing, so it never blocks delivery to
 * the rest of a batch — beta scope is single-device-per-user anyway, so a
 * batch here is realistically size 1, but the shape stays correct for
 * multi-device later.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushResult {
  sent: string[];
  failed: string[];
}

export async function sendExpoPush(tokens: string[], message: PushMessage): Promise<PushResult> {
  if (tokens.length === 0) return { sent: [], failed: [] };

  const sent: string[] = [];
  const failed: string[] = [];

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(
        batch.map((to) => ({ to, title: message.title, body: message.body, data: message.data }))
      ),
    });

    if (!res.ok) {
      failed.push(...batch);
      continue;
    }

    const json = await res.json();
    const tickets: Array<{ status: string }> = json.data ?? [];
    batch.forEach((token, idx) => {
      if (tickets[idx]?.status === "ok") sent.push(token);
      else failed.push(token);
    });
  }

  return { sent, failed };
}
