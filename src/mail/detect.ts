// Newsletter detection over raw RFC 822 header text. The list headers (List-Unsubscribe,
// List-Id, Precedence) catch nearly every newsletter; the sending-platform domains backstop the
// few that send without them. Everything else in the mailbox is left alone and never fetched.

const ESP_DOMAINS = [
  "substack.com",
  "beehiiv.com",
  "mail.beehiiv.com",
  "buttondown.email",
  "buttondown.com",
  "convertkit.com",
  "kit.com",
  "ghost.io",
  "list-manage.com",
  "campaign-archive.com",
  "every.to",
  "morningbrew.com",
  "stratechery.com",
  "lennysnewsletter.com",
];

export function headerLooksLikeNewsletter(headerText: string): boolean {
  if (/^list-unsubscribe\s*:/im.test(headerText)) return true;
  if (/^list-id\s*:/im.test(headerText)) return true;
  if (/^precedence\s*:\s*(bulk|list)/im.test(headerText)) return true;
  if (/^x-campaign(?:-?id)?\s*:/im.test(headerText)) return true;
  const from = fromAddress(headerText);
  if (!from) return false;
  const domain = from.split("@")[1] ?? "";
  return ESP_DOMAINS.some((d) => domain === d || domain.endsWith("." + d));
}

/** The Date: header as epoch ms; null when missing or malformed. */
export function headerDate(headerText: string): number | null {
  const line = headerText.match(/^date\s*:\s*(.+)$/im)?.[1];
  if (!line) return null;
  const t = Date.parse(line.trim());
  return Number.isNaN(t) ? null : t;
}

/** The Message-ID, angle brackets kept, matching mailparser. */
export function headerMessageId(headerText: string): string | null {
  return headerText.match(/^message-id\s*:\s*(\S+)/im)?.[1]?.trim() ?? null;
}

/** The bare address from the From: line. */
export function fromAddress(headerText: string): string | null {
  const line = headerText.match(/^from\s*:\s*(.+)$/im)?.[1];
  if (!line) return null;
  const angled = line.match(/<([^>]+)>/);
  const addr = (angled ? angled[1] : line).trim().toLowerCase();
  return addr.includes("@") ? addr : null;
}

export function isSelf(address: string | null, accountUser: string): boolean {
  return !!address && address === accountUser.toLowerCase();
}
