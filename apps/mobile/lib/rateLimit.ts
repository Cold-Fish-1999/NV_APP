const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 分钟
const MAX_SENDS_PER_WINDOW = 9999;

const sendsByEmail: Record<string, number[]> = {};

function prune(email: string) {
  const now = Date.now();
  const cut = now - RATE_LIMIT_WINDOW_MS;
  if (!sendsByEmail[email]) return;
  sendsByEmail[email] = sendsByEmail[email].filter((t) => t > cut);
  if (sendsByEmail[email].length === 0) delete sendsByEmail[email];
}

export function canSendMagicLink(email: string): boolean {
  prune(email);
  const list = sendsByEmail[email] ?? [];
  return list.length < MAX_SENDS_PER_WINDOW;
}

export function recordMagicLinkSent(email: string) {
  const list = sendsByEmail[email] ?? [];
  list.push(Date.now());
  sendsByEmail[email] = list;
}

export function getRemainingCooldownSeconds(email: string): number {
  prune(email);
  const list = sendsByEmail[email] ?? [];
  if (list.length < MAX_SENDS_PER_WINDOW) return 0;
  const oldestInWindow = list[0];
  const windowEnd = oldestInWindow + RATE_LIMIT_WINDOW_MS;
  return Math.max(0, Math.ceil((windowEnd - Date.now()) / 1000));
}
