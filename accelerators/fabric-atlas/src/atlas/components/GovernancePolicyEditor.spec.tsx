import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { POSTURE_TARGETS } from "../posture";
import { GovernancePolicyEditor } from "./GovernancePolicyEditor";

describe("GovernancePolicyEditor", () => {
  const props = {
    targets: POSTURE_TARGETS,
    loading: false,
    canEdit: true,
    onRetry: vi.fn(async () => undefined),
    onSave: vi.fn(async () => undefined),
    onReset: vi.fn(async () => undefined),
  };

  it("saves all six validated targets", async () => {
    const onSave = vi.fn(async () => undefined);
    render(<GovernancePolicyEditor {...props} onSave={onSave} />);
    expect(
      screen.getByText(/standard target is 70% for every pillar/i),
    ).toBeVisible();

    fireEvent.change(screen.getByLabelText("Access target"), {
      target: { value: "82" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save targets" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        ...POSTURE_TARGETS,
        access: 82,
      }),
    );
  });

  it("shows a retry state instead of loaded defaults after a read failure", () => {
    render(
      <GovernancePolicyEditor
        {...props}
        error="policy unavailable"
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("policy unavailable");
    expect(screen.queryByLabelText("Access target")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Retry targets" }),
    ).toBeInTheDocument();
  });
});
