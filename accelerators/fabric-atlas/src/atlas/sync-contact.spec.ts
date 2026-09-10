import { describe, expect, it } from "vitest";
import { syncContactMessage } from "./sync-contact";

describe("syncContactMessage", () => {
  it("identifies who can run a blocked synchronization", () => {
    expect(syncContactMessage("publisher@example.com")).toBe(
      "Ask publisher@example.com to run this synchronization.",
    );
    expect(syncContactMessage("")).toBe(
      "Ask the configured synchronization administrator to run this synchronization.",
    );
  });
});
