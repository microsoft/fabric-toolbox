import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { itemOneLakeRoles } from "../governance-evidence";
import { SAMPLE_DATA } from "../model";
import { OneLakeRolesList } from "./OneLakeRolesList";

const LAKEHOUSE = SAMPLE_DATA.governanceEvidence!.oneLakeRoles.entries[0].itemId;

describe("OneLake data access roles", () => {
  it("lists the roles of one lakehouse with RLS and CLS markers", () => {
    const value = itemOneLakeRoles(SAMPLE_DATA.governanceEvidence, LAKEHOUSE);
    expect(value.known).toBe(true);
    render(<OneLakeRolesList value={value} />);
    const restricted = screen.getByText("EMEA_Analysts").closest("tr")!;
    expect(restricted).toHaveTextContent("region = 'EMEA'");
    expect(restricted).toHaveTextContent("hides 2: customer_email, phone");
    expect(screen.getByText("DefaultReader").closest("tr")).toHaveTextContent("Workspace viewers");
  });

  it("shows Unknown when the roles section was not collected", () => {
    const evidence = {
      ...SAMPLE_DATA.governanceEvidence!,
      oneLakeRoles: { status: { status: "failed" as const, code: "forbidden" }, entries: [] },
    };
    const value = itemOneLakeRoles(evidence, LAKEHOUSE);
    expect(value).toEqual({ known: false, roles: [] });
    render(<OneLakeRolesList value={value} />);
    expect(screen.getByText(/Unknown/)).toBeInTheDocument();
    expect(itemOneLakeRoles(undefined, LAKEHOUSE).known).toBe(false);
  });
});