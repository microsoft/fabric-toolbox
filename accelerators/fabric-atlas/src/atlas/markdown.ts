export function markdownText(value: unknown): string {
  let text = String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\\/g, "\\\\");
  if (text.includes("[") && text.includes("](")) {
    text = text
      .replaceAll("[", "\\[")
      .replaceAll("]", "\\]")
      .replaceAll("(", "\\(")
      .replaceAll(")", "\\)");
  }
  return text.replace(/[`*_{}#+!|<>]/g, "\\$&").trim();
}

export function markdownCodeBlock(
  value: unknown,
  language = "",
): string[] {
  const text = String(value ?? "");
  const longestRun = Math.max(
    0,
    ...[...text.matchAll(/`+/g)].map((match) => match[0].length),
  );
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return [`${fence}${language}`, text, fence];
}
