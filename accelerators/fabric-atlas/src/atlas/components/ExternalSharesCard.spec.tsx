import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SAMPLE_DATA } from "../model";
import { ExternalSharesCard } from "./ExternalSharesCard";

describe("ExternalSharesCard", () => {
  it("lists recipient tenant, paths, status and creator for each share", () => {
    render(<ExternalSharesCard evidence={SAMPLE_DATA.governanceEvidence} items={SAMPLE_DATA.items} />);
    const share = SAMPLE_DATA.governanceEvidence!.externalShares.entries[0];
    const table = screen.getByRole("table", { name: "External shares" });
    const row = within(table).getAllByRole("row")[1];
    expect(row).toHaveTextContent(share.status);
    expect(row).toHaveTextContent(share.recipient!);
    expect(row).toHaveTextContent(share.paths[0]);
  });

  it("shows Unknown when the section was not collected", () => {
    const evidence = { ...SAMPLE_DATA.governanceEvidence!, externalShares: { status: { status: "failed" as const }, entries: [] } };
    render(<ExternalSharesCard evidence={evidence} items={SAMPLE_DATA.items} />);
    expect(screen.getByText(/External shares: Unknown/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
