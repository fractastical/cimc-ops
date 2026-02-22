export function splitGranteeNames(raw: string): string[] {
  if (!raw || raw.trim().length < 2) return [];
  return raw
    .split(/\s*[;,&]\s*|\s+and\s+/i)
    .map(n => n.trim())
    .filter(n => n.length >= 2);
}
