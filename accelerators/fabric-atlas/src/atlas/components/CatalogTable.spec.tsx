import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogTable } from "./CatalogTable";
import { SAMPLE_DATA, type ItemType } from "../model";

const model = SAMPLE_DATA.items.find((item) => item.itemType === "SemanticModel")!;

function Harness({ searching = false, onSelect = vi.fn() }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (type: ItemType) => setExpanded((previous) => {
    const next = new Set(previous);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    return next;
  });
  return <CatalogTable items={[model]} expanded={expanded} searching={searching} selectedId={null} onToggle={toggle} onSelect={onSelect} />;
}

describe("CatalogTable", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("keeps groups collapsed until opened", () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    expect(screen.queryByRole("button", { name: `Open details for ${model.displayName}` })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Semantic model/i }));
    fireEvent.click(screen.getByRole("button", { name: `Open details for ${model.displayName}` }));
    expect(onSelect).toHaveBeenCalledWith(model.fabricId);
  });

  it("opens matching groups while searching without changing stored expansion", () => {
    const { rerender } = render(<Harness searching />);
    expect(screen.getByRole("button", { name: `Open details for ${model.displayName}` })).toBeVisible();
    rerender(<Harness />);
    expect(screen.queryByRole("button", { name: `Open details for ${model.displayName}` })).not.toBeInTheDocument();
  });

  it("announces the active sort direction", () => {
    render(<Harness />);
    const sort = screen.getByRole("button", { name: "Sort by item" });
    expect(sort.closest("th")).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(sort);
    expect(sort.closest("th")).toHaveAttribute("aria-sort", "descending");
  });
});
