import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GovernanceExceptionControl } from "./GovernanceExceptionControl";

const base = {
  findingId: "finding-1",
  findingTitle: "External access",
  canEdit: true,
  loading: false,
  pending: false,
  onSave: vi.fn(async () => undefined),
  onRemove: vi.fn(async () => undefined),
};

describe("GovernanceExceptionControl", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("requires a reason and submits a future expiry", async () => {
    const onSave = vi.fn(async () => undefined);
    render(<GovernanceExceptionControl {...base} onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "Add exception" }));
    fireEvent.change(screen.getByLabelText("Justification"), {
      target: { value: "Accepted during the migration window." },
    });
    fireEvent.change(screen.getByLabelText("Expires"), {
      target: { value: "2099-09-05T12:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save exception" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          findingId: "finding-1",
          reason: "Accepted during the migration window.",
        }),
      ),
    );
  });

  it("changes an active exception to expired while the view remains open", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T12:00:00.000Z"));
    render(
      <GovernanceExceptionControl
        {...base}
        exception={{
          id: "exception-1",
          findingId: "finding-1",
          reason: "Short maintenance window.",
          expiresAt: "2026-09-05T12:00:01.000Z",
          authorId: "admin-1",
          authorName: "Admin",
          authorEmail: "admin@example.com",
          createdAt: "2026-09-05T11:00:00.000Z",
          updatedAt: "2026-09-05T11:00:00.000Z",
        }}
      />,
    );

    expect(screen.getByText("Active exception")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1_100);
    });
    expect(screen.getByText("Expired exception")).toBeInTheDocument();
  });
});
