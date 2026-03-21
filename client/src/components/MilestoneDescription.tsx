interface Props {
  description: string;
  className?: string;
  compact?: boolean;
}

function parseNumberedItems(text: string): string[] {
  if (!text) return [];
  const trimmed = text.trim();

  const newlineSplit = trimmed.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const numbered = newlineSplit.filter(line => /^\d+[).]\s/.test(line));
  if (numbered.length >= 2) {
    return newlineSplit.map(line => line.replace(/^\d+[).]\s+/, "").trim()).filter(Boolean);
  }

  const inlineParts = trimmed.split(/(?<=\S)\s+\d+[).]\s+/).map(s => s.trim()).filter(Boolean);
  if (inlineParts.length >= 2) {
    return inlineParts;
  }

  return [trimmed];
}

export function MilestoneDescription({ description, className = "", compact = false }: Props) {
  const items = parseNumberedItems(description);

  if (items.length <= 1) {
    return (
      <p className={`text-sm whitespace-pre-wrap ${className}`}>{description.trim()}</p>
    );
  }

  return (
    <ol className={`space-y-${compact ? "1" : "2"} ${className}`}>
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 items-start">
          <span
            className={`flex-shrink-0 flex items-center justify-center rounded-full bg-primary/20 text-primary font-bold font-mono leading-none
              ${compact ? "w-4 h-4 text-[10px] mt-0.5" : "w-5 h-5 text-xs mt-0.5"}`}
          >
            {i + 1}
          </span>
          <span className={compact ? "text-xs leading-snug" : "text-sm leading-snug"}>{item}</span>
        </li>
      ))}
    </ol>
  );
}

export function milestoneDescriptionPreview(description: string, maxLength = 120): string {
  const items = parseNumberedItems(description);
  if (items.length <= 1) return description.trim().slice(0, maxLength);
  return items.map((item, i) => `${i + 1}) ${item}`).join(" · ").slice(0, maxLength);
}
