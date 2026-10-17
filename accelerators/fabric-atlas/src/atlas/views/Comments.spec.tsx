import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AtlasProvider, useAtlas } from "../store";
import { SAMPLE_DATA } from "../model";
import { CommentsView } from "./Comments";

function NoteTarget() {
  const { data } = useAtlas();
  const note = data.comments.at(-1);
  return <output data-testid="note-target">{note?.body}|{note?.itemFabricId ?? "workspace"}</output>;
}

describe("CommentsView", () => {
  it("shows the authenticated email beside a distinct display name", () => {
    const comment = SAMPLE_DATA.comments[0];
    render(
      <AtlasProvider isPreview>
        <CommentsView />
      </AtlasProvider>,
    );

    expect(screen.getAllByText(comment.authorName).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(`Authenticated as ${comment.authorEmail}`).length,
    ).toBeGreaterThan(0);
  });
  it("posts to the displayed workspace scope instead of a carried foreign item", async () => {
    render(
      <AtlasProvider isPreview>
        <CommentsView focus={{ requestId: "carried-note", itemId: "20000000-0000-4000-8000-000000000001" }} />
        <NoteTarget />
      </AtlasProvider>,
    );
    expect(screen.getByLabelText("Target")).toHaveValue("");
    expect(screen.getByText("This note applies to the entire workspace.")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Scoped note regression" } });
    fireEvent.click(screen.getByRole("button", { name: "Post note" }));
    await waitFor(() => expect(screen.getByTestId("note-target")).toHaveTextContent("Scoped note regression|workspace"));
  });
});
