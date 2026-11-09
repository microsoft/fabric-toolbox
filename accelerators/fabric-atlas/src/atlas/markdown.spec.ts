import { describe, expect, it } from "vitest";
import { markdownCodeBlock, markdownText } from "./markdown";

describe("Markdown export helpers", () => {
  it("escapes links, HTML, headings and list syntax", () => {
    expect(markdownText("[Item](javascript:alert(1)) <img> # heading"))
      .toBe("\\[Item\\]\\(javascript:alert\\(1\\)\\) \\<img\\> \\# heading");
  });

  it("uses a fence longer than any backtick run in the content", () => {
    expect(markdownCodeBlock("before\n```\nafter", "dax")).toEqual([
      "````dax",
      "before\n```\nafter",
      "````",
    ]);
  });
});
