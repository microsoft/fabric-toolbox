import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAccessReviewRows } from "../governance";
import { SAMPLE_DATA } from "../model";
import { AtlasProvider } from "../store";
import { AccessReviewDetailPanel, AccessView } from "../views/Access";
import type { AccessReviewHistory } from "../access-reviews";
import { AccessWhatIf } from "./AccessWhatIf";
import * as accessReviews from "../access-reviews";

const rows = buildAccessReviewRows(SAMPLE_DATA).filter((row) => row.effectiveAccess !== "none");
const mixedRow = rows.find((row) =>
  row.principalRef === "System Administrator" &&
  row.item.displayName === "AlpineRent Executive Dashboard",
)!;

function renderView(onStateChange = vi.fn()) {
  return render(<AtlasProvider isPreview><AccessView onStateChange={onStateChange} /></AtlasProvider>);
}

function choosePair(id = mixedRow.id) {
  fireEvent.change(screen.getByRole("combobox", { name: "Recorded grant pair" }), {
    target: { value: id },
  });
  showAdvancedPaths();
}

function showAdvancedPaths() {
  const summary = screen.getByText("Advanced: paths, provenance and limits");
  if (!summary.closest("details")?.open) fireEvent.click(summary);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.style.removeProperty("--atlas-evidence-breakpoint");
});

describe("read-only grant What-if UI", () => {
  it("shows strongest grants and modeled layers first, keeping detailed paths collapsed", () => {
    render(<AccessWhatIf rows={rows} row={mixedRow} onSelect={vi.fn()} onInspect={vi.fn()} />);
    expect(screen.getByText("Current strongest recorded grant")).toBeVisible();
    expect(screen.getByText("Simulated result")).toBeVisible();
    expect(screen.getByRole("region", { name: "Modeled grant layers" })).toBeVisible();
    expect(screen.getByText("Advanced: paths, provenance and limits").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByRole("checkbox", { name: /Item grants/ })).not.toBeVisible();
    expect(screen.getByText(/No Fabric permissions are changed/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Export What-if CSV" })).toBeVisible();
    showAdvancedPaths();
    expect(screen.getByRole("checkbox", { name: /Item grants/ })).toBeVisible();
  });
  it("copies grant evidence without personal decisions or notes in the read-only inspector", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const review: AccessReviewHistory = {
      rowKey: mixedRow.id, itemFabricId: mixedRow.itemId, principalRef: mixedRow.principalRef,
      history: [],
      decision: {
        id: "event-id", rowKey: mixedRow.id, itemFabricId: mixedRow.itemId,
        principalRef: mixedRow.principalRef, status: "accepted", evidenceKey: "evidence",
        reviewedAt: "2026-10-02T12:00:00.000Z", updatedAt: "2026-10-02T12:00:00.000Z",
        needsReview: false, source: "event", note: "PRIVATE_REVIEW_NOTE",
      },
    };
    render(<AccessReviewDetailPanel row={mixedRow} readOnly review={review}
      reviewsLoading={false} saving={false} onSaveDecision={vi.fn()} onClearDecision={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy grant evidence" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0][0]).toContain("Unknown or incomplete layers:");
    expect(writeText.mock.calls[0][0]).not.toMatch(/PRIVATE_REVIEW_NOTE|Review decision:|Review note:/);
    expect(screen.queryByRole("button", { name: "Accepted" })).not.toBeInTheDocument();
  });

  it("excludes individual and whole-layer paths, explains inherited grants, and resets", () => {
    const save = vi.spyOn(accessReviews, "saveAccessReview");
    const clear = vi.spyOn(accessReviews, "clearAccessReview");
    const onStateChange = vi.fn();
    renderView(onStateChange);
    fireEvent.click(screen.getByRole("button", { name: "What-if" }));
    choosePair();
    const simulator = screen.getByRole("region", { name: "Read-only grant What-if" });
    expect(screen.queryByRole("button", { name: "Accepted" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export CSV" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save current view/i })).not.toBeInTheDocument();
    const itemPath = within(simulator).getByRole("checkbox", { name: /Item grants/ });
    fireEvent.click(itemPath);
    expect(itemPath).toBeChecked();
    expect(within(simulator).getByRole("status")).toHaveTextContent("highest recorded grant unchanged");
    fireEvent.click(within(simulator).getByRole("button", { name: "Exclude all workspace-inherited grants" }));
    expect(within(simulator).getByText("No positive recorded grant")).toBeVisible();
    expect(within(simulator).getByRole("status")).toHaveTextContent("does not prove that actual access is removed");
    expect(within(simulator).getByText(/OneLake security: Unsupported/)).toBeVisible();
    expect(within(simulator).getByText(/Purview DLP: Unsupported/)).toBeVisible();
    expect(within(simulator).getByText(/Fabric Policies: Evidence unavailable/)).toBeVisible();
    const modeled = within(simulator).getByRole("region", { name: "Modeled grant layers" });
    expect(modeled).toHaveTextContent("Workspace grants (recorded paths only; Observed grants)");
    expect(modeled).toHaveTextContent("Item grants (recorded paths only; Observed grants)");
    fireEvent.click(within(simulator).getByRole("button", { name: "Reset simulation" }));
    expect(within(simulator).getAllByRole("checkbox").every((input) => !(input as HTMLInputElement).checked)).toBe(true);
    expect(within(simulator).getByRole("status")).toHaveTextContent("No recorded grant paths are excluded.");
    expect(save).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    const lastNavigation = onStateChange.mock.calls.at(-1)![0];
    expect(Object.keys(lastNavigation.focus.filters).sort())
      .toEqual(["accessLevel", "coverage", "mode", "origin", "risk", "search"].sort());
    expect(lastNavigation.focus.filters.mode).toBe("what-if");
  });

  it("resets exclusions on pair, source snapshot and mode changes", () => {
    const rendered = render(<AccessWhatIf rows={rows} row={mixedRow} onSelect={vi.fn()} onInspect={vi.fn()} />);
    showAdvancedPaths();
    fireEvent.click(screen.getByRole("button", { name: "Exclude all recorded item grants" }));
    expect(screen.getByRole("checkbox", { name: /Item grants/ })).toBeChecked();
    rendered.rerender(<AccessWhatIf rows={rows} row={{
      ...mixedRow, coverage: { ...mixedRow.coverage, snapshotId: "new-snapshot" },
    }} onSelect={vi.fn()} onInspect={vi.fn()} />);
    showAdvancedPaths();
    expect(screen.getByRole("checkbox", { name: /Item grants/ })).not.toBeChecked();
    rendered.unmount();
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "What-if" }));
    choosePair();
    fireEvent.click(screen.getByRole("button", { name: "Exclude all recorded item grants" }));
    choosePair(rows.find((row) => row.id !== mixedRow.id)!.id);
    expect(screen.getAllByRole("checkbox").every((input) => !(input as HTMLInputElement).checked)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Exclude all workspace-inherited grants" }));
    fireEvent.click(screen.getByRole("button", { name: "Review matrix" }));
    fireEvent.click(screen.getByRole("button", { name: "What-if" }));
    showAdvancedPaths();
    expect(screen.getAllByRole("checkbox").every((input) => !(input as HTMLInputElement).checked)).toBe(true);
  });

  it("honors restored What-if mode and hides results when coverage filters remove the pair", () => {
    render(<AtlasProvider isPreview><AccessView initialFilters={{ mode: "what-if" }} /></AtlasProvider>);
    expect(screen.getByRole("button", { name: "What-if" })).toHaveAttribute("aria-pressed", "true");
    choosePair();
    fireEvent.change(screen.getByRole("combobox", { name: "Evidence coverage" }), { target: { value: "denied" } });
    expect(screen.getByText(/No recorded grant pairs match the filters/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Export What-if Markdown" })).not.toBeInTheDocument();
    expect(screen.queryByText("Simulated result")).not.toBeInTheDocument();
  });

  it("downloads honest Markdown and CSV scenario summaries without altering source rows", async () => {
    const blobs: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      blobs.push(blob as Blob);
      return "blob:scenario";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const before = JSON.stringify(SAMPLE_DATA.grants);
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "What-if" }));
    choosePair();
    fireEvent.click(screen.getByRole("button", { name: "Exclude all workspace-inherited grants" }));
    fireEvent.click(screen.getByRole("button", { name: "Exclude all recorded item grants" }));
    fireEvent.click(screen.getByRole("button", { name: "Export What-if Markdown" }));
    fireEvent.click(screen.getByRole("button", { name: "Export What-if CSV" }));
    expect(blobs.map((blob) => blob.type)).toEqual(["text/markdown;charset=utf-8", "text/csv;charset=utf-8"]);
    for (const blob of blobs) {
      const text = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsText(blob);
      });
      expect(text).toContain("No positive recorded grant");
      expect(text).toContain("Modeled layers");
      expect(text).toContain("Workspace grants (recorded paths only");
      expect(text).toContain("Item grants (recorded paths only");
      expect(text).toContain("OneLake security: Unsupported");
      expect(text).toContain("No Fabric permissions are changed.");
      expect(text).not.toMatch(/no restrictions|none observed/i);
    }
    expect(JSON.stringify(SAMPLE_DATA.grants)).toBe(before);
  });
});

describe("responsive Access evidence inspector", () => {
  function media() {
    let matches = false;
    const listeners = new Set<() => void>();
    const value = {
      get matches() { return matches; },
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    };
    document.documentElement.style.setProperty("--atlas-evidence-breakpoint", "80rem");
    vi.stubGlobal("matchMedia", vi.fn(() => value));
    return (desktop: boolean) => act(() => {
      matches = desktop;
      listeners.forEach((listener) => listener());
    });
  }

  it("does not compete with the existing principal departure dialog on a deep link", async () => {
    media();
    render(<AtlasProvider isPreview><AccessView initialPrincipalId={mixedRow.principalId} /></AtlasProvider>);
    await screen.findByRole("dialog");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.queryByRole("dialog", { name: "Access evidence" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close departure pack" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("retains the current personal note draft when the inspector changes presentation", async () => {
    const resize = media();
    renderView();
    fireEvent.click(screen.getAllByRole("option", { name: /Review .+ access to/ })[0]);
    const dialog = await screen.findByRole("dialog", { name: "Access evidence" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Review note (optional)" }), {
      target: { value: "Draft review rationale" },
    });
    resize(true);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: "Review note (optional)" })).toHaveValue("Draft review rationale");
    resize(false);
    const drawer = await screen.findByRole("dialog", { name: "Access evidence" });
    expect(within(drawer).getByRole("textbox", { name: "Review note (optional)" })).toHaveValue("Draft review rationale");
  });

  it("opens a managed drawer from the keyboard, traps Tab and restores focus on Escape", async () => {
    media();
    renderView();
    const row = screen.getAllByRole("option", { name: /Review .+ access to/ })[0];
    row.focus();
    fireEvent.keyDown(row, { key: "Enter" });
    const dialog = await screen.findByRole("dialog", { name: "Access evidence" });
    const close = within(dialog).getByRole("button", { name: "Close review detail" });
    await waitFor(() => expect(close).toHaveFocus());
    expect(within(dialog).getByRole("heading", { name: "1. Granted permissions" })).toBeVisible();
    expect(within(dialog).getByRole("heading", { name: "2. Restriction evidence" })).toBeVisible();
    expect(within(dialog).getByRole("heading", { name: "3. Assessment" })).toBeVisible();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    const last = within(dialog).getByRole("button", { name: "Copy review summary" });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(row).toHaveFocus());
  });

  it("keeps What-if local state across mobile inspection, dismissal and a desktop resize", async () => {
    const resize = media();
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "What-if" }));
    choosePair();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const checkbox = screen.getByRole("checkbox", { name: /Item grants/ });
    fireEvent.click(checkbox);
    const inspect = screen.getByRole("button", { name: "Inspect access evidence" });
    fireEvent.click(inspect);
    const dialog = await screen.findByRole("dialog", { name: "Access evidence" });
    expect(within(dialog).queryByRole("button", { name: "Accepted" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("textbox", { name: "Review note (optional)" })).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(inspect).toHaveFocus());
    expect(checkbox).toBeChecked();
    fireEvent.click(inspect);
    resize(true);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("complementary", { name: "Selected access evidence" })).toBeVisible();
    expect(checkbox).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Close review detail" }));
    expect(screen.queryByRole("complementary", { name: "Selected access evidence" })).not.toBeInTheDocument();
    expect(checkbox).toBeChecked();
  });

  it("enters read-only What-if from the matrix evidence panel without an abandoned focus target", () => {
    renderView();
    fireEvent.click(screen.getAllByRole("option", { name: /Review .+ access to/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Simulate grant removal" }));
    expect(screen.getByRole("region", { name: "Read-only grant What-if" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Recorded grant pair" })).not.toHaveValue("");
    expect(screen.queryByRole("button", { name: "Accepted" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "What-if" })).toHaveFocus();
  });
});
