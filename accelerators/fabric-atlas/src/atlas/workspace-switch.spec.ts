import { afterEach, describe, expect, it } from "vitest";
import {
  captureWorkspaceFocus,
  FIRST_SYNC_WORKSPACE_SELECT_ID,
  HEADER_WORKSPACE_SELECT_ID,
  HUB_WORKSPACE_SELECT_ID,
  restoreWorkspaceFocus,
} from "./workspace-switch";

function mountSelect(id: string, disabled = false): HTMLSelectElement {
  const select = document.createElement("select");
  select.id = id;
  select.disabled = disabled;
  document.body.append(select);
  return select;
}

describe("workspace switch focus", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("prefers the originating selector, then the header and first-sync selectors", () => {
    expect(captureWorkspaceFocus(HUB_WORKSPACE_SELECT_ID).order).toEqual([
      HUB_WORKSPACE_SELECT_ID,
      HEADER_WORKSPACE_SELECT_ID,
      FIRST_SYNC_WORKSPACE_SELECT_ID,
    ]);
    expect(captureWorkspaceFocus(HEADER_WORKSPACE_SELECT_ID).order).toEqual([
      HEADER_WORKSPACE_SELECT_ID,
      FIRST_SYNC_WORKSPACE_SELECT_ID,
    ]);
    expect(captureWorkspaceFocus(undefined).order).toEqual([]);
  });

  it("waits for a remounted selector instead of reusing the replaced one", () => {
    const original = mountSelect(HUB_WORKSPACE_SELECT_ID);
    const header = mountSelect(HEADER_WORKSPACE_SELECT_ID);
    const capture = captureWorkspaceFocus(HUB_WORKSPACE_SELECT_ID);

    expect(restoreWorkspaceFocus(capture)).toBeUndefined();

    original.remove();
    header.remove();
    const remountedHeader = mountSelect(HEADER_WORKSPACE_SELECT_ID);
    expect(restoreWorkspaceFocus(capture)).toBe(remountedHeader);
    expect(remountedHeader).toHaveFocus();
  });

  it("falls through to the first-sync gate and skips disabled selectors", () => {
    const capture = captureWorkspaceFocus(HEADER_WORKSPACE_SELECT_ID);
    mountSelect(HEADER_WORKSPACE_SELECT_ID, true);
    const gate = mountSelect(FIRST_SYNC_WORKSPACE_SELECT_ID);

    expect(restoreWorkspaceFocus(capture)).toBe(gate);
    expect(gate).toHaveFocus();
  });
});
