import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PreviewApiNotice } from "./PreviewApiNotice";

describe("PreviewApiNotice", () => {
  it("shows one source with maturity, version and documentation", () => {
    render(<PreviewApiNotice featureIds={["item-relations"]} />);

    expect(screen.getByText("Beta API")).toBeInTheDocument();
    expect(
      screen.getByText(/Fabric Item Relations · Fabric REST v1, beta=true/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Microsoft documentation" }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("get-upstream-relations"),
    );
  });

  it("summarizes multiple preview integrations", () => {
    render(
      <PreviewApiNotice
        featureIds={["fabric-policies", "catalog-search"]}
      />,
    );

    expect(
      screen.getByText("2 preview integrations"),
    ).toBeInTheDocument();
    expect(screen.getByText("Policies in Fabric")).toBeInTheDocument();
    expect(screen.getByText("OneLake Catalog Search")).toBeInTheDocument();
  });

  it("keeps its compact type size even when a caller adds classes", () => {
    render(
      <PreviewApiNotice featureIds={["fabric-app-functions"]} className="mt-s" />,
    );

    const note = screen.getByRole("note", { name: "Preview API information" });
    expect(note.className).toContain("text-[length:var(--text-200)]");
    expect(note.className).toContain("leading-200");
    expect(note.className).toContain("mt-s");
  });
});
