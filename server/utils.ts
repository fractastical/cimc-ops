const BOT_PATTERNS = [
  /\[bot\]$/i,
  /^dependabot$/i,
  /^renovate$/i,
  /^github-actions$/i,
  /^replit/i,
  /^snyk-bot$/i,
  /^greenkeeper$/i,
  /^codecov$/i,
];

export function isBot(author: string): boolean {
  return BOT_PATTERNS.some(pattern => pattern.test(author));
}

export function splitGranteeNames(raw: string): string[] {
  if (!raw || raw.trim().length < 2) return [];
  return raw
    .split(/\s*[;,&]\s*|\s+and\s+/i)
    .map(n => n.trim())
    .filter(n => n.length >= 2);
}
