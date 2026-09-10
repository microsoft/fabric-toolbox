export interface DaxRef {
  kind: "column" | "measure";
  table?: string;
  name: string;
}

function stripStringsAndComments(expression: string): string {
  const output = [...expression];
  let index = 0;
  while (index < expression.length) {
    const current = expression[index];
    const next = expression[index + 1];
    if (current === '"') {
      output[index++] = " ";
      while (index < expression.length) {
        output[index] = expression[index] === "\n" ? "\n" : " ";
        if (expression[index] === '"' && expression[index + 1] === '"') {
          output[index + 1] = " ";
          index += 2;
          continue;
        }
        if (expression[index++] === '"') break;
      }
      continue;
    }
    if (
      (current === "/" && next === "/") ||
      (current === "-" && next === "-")
    ) {
      output[index++] = " ";
      output[index++] = " ";
      while (index < expression.length && expression[index] !== "\n") {
        output[index++] = " ";
      }
      continue;
    }
    if (current === "/" && next === "*") {
      output[index++] = " ";
      output[index++] = " ";
      while (index < expression.length) {
        if (expression[index] === "*" && expression[index + 1] === "/") {
          output[index++] = " ";
          output[index++] = " ";
          break;
        }
        output[index] = expression[index] === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }
    index += 1;
  }
  return output.join("");
}

function readBracket(
  expression: string,
  start: number,
): { value: string; end: number } | undefined {
  if (expression[start] !== "[") return undefined;
  let value = "";
  let index = start + 1;
  while (index < expression.length) {
    if (expression[index] === "]" && expression[index + 1] === "]") {
      value += "]";
      index += 2;
      continue;
    }
    if (expression[index] === "]") {
      const normalized = value.trim();
      return normalized ? { value: normalized, end: index + 1 } : undefined;
    }
    value += expression[index++];
  }
  return undefined;
}

function readQuotedTable(
  expression: string,
  start: number,
): { value: string; end: number } | undefined {
  if (expression[start] !== "'") return undefined;
  let value = "";
  let index = start + 1;
  while (index < expression.length) {
    if (expression[index] === "'" && expression[index + 1] === "'") {
      value += "'";
      index += 2;
      continue;
    }
    if (expression[index] === "'") {
      const normalized = value.trim();
      return normalized ? { value: normalized, end: index + 1 } : undefined;
    }
    value += expression[index++];
  }
  return undefined;
}

function skipWhitespace(expression: string, start: number): number {
  let index = start;
  while (/\s/.test(expression[index] ?? "")) index += 1;
  return index;
}

export function extractDaxRefs(expression: string): DaxRef[] {
  const code = stripStringsAndComments(expression);
  const references: DaxRef[] = [];
  const seen = new Set<string>();
  const push = (reference: DaxRef) => {
    const key = [
      reference.kind,
      reference.table?.toLocaleLowerCase() ?? "",
      reference.name.toLocaleLowerCase(),
    ].join("\u0000");
    if (!seen.has(key)) {
      seen.add(key);
      references.push(reference);
    }
  };

  let index = 0;
  while (index < code.length) {
    const quotedTable = readQuotedTable(code, index);
    if (quotedTable) {
      const bracketStart = skipWhitespace(code, quotedTable.end);
      const bracket = readBracket(code, bracketStart);
      if (bracket) {
        push({
          kind: "column",
          table: quotedTable.value,
          name: bracket.value,
        });
        index = bracket.end;
        continue;
      }
      index = quotedTable.end;
      continue;
    }
    if (code[index] === "'") break;

    const identifier = /^[\p{L}_][\p{L}\p{N}_.]*/u.exec(code.slice(index));
    if (identifier) {
      const identifierEnd = index + identifier[0].length;
      const bracketStart = skipWhitespace(code, identifierEnd);
      const bracket = readBracket(code, bracketStart);
      if (bracket) {
        push({
          kind: "column",
          table: identifier[0],
          name: bracket.value,
        });
        index = bracket.end;
        continue;
      }
      index = identifierEnd;
      continue;
    }

    const bracket = readBracket(code, index);
    if (bracket) {
      push({ kind: "measure", name: bracket.value });
      index = bracket.end;
      continue;
    }
    index += 1;
  }
  return references;
}
