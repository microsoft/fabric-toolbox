import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AtlasProvider } from "../store";
import { SAMPLE_DATA } from "../model";
import { CommentsView } from "./Comments";

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
});
