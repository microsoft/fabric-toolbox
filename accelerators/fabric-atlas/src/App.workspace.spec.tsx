import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { SAMPLE_DATA } from "@/atlas/model";
import { AtlasProvider } from "@/atlas/store";
import {
    DRAWER_WORKSPACE_SELECT_ID,
    HEADER_WORKSPACE_SELECT_ID,
    HUB_WORKSPACE_SELECT_ID,
} from "@/atlas/workspace-switch";
import { ThemeContext } from "@/hooks/theme.context";

const SECOND_WORKSPACE = "9a2a1b5e-58e3-4c43-9a8f-1f7c6f3f2a10";

vi.mock("@/atlas/components/PostureRadar", () => ({
    PostureRadar: () => <figure aria-label="Governance posture radar" />,
}));

vi.mock("@/atlas/workspace-scope", async (importOriginal) => {
    const actual =
        await importOriginal<typeof import("@/atlas/workspace-scope")>();
    const { SAMPLE_DATA: sample } = await import("@/atlas/model");
    return {
        ...actual,
        loadWorkspaceScopes: vi.fn(async () => [
            {
                id: sample.workspace.fabricId,
                displayName: sample.workspace.displayName,
                persisted: true,
                selectedAt: "2026-10-01T08:00:00.000Z",
            },
            {
                id: "9a2a1b5e-58e3-4c43-9a8f-1f7c6f3f2a10",
                displayName: "Second workspace",
                persisted: true,
                selectedAt: "2026-10-01T08:00:00.000Z",
            },
        ]),
    };
});

function renderApp() {
    return render(
        <ThemeContext.Provider value={{ isDark: false, toggleTheme: () => undefined }}>
            <AtlasProvider isPreview>
                <App />
            </AtlasProvider>
        </ThemeContext.Provider>,
    );
}

async function headerSelector(): Promise<HTMLSelectElement> {
    await waitFor(() =>
        expect(document.getElementById(HEADER_WORKSPACE_SELECT_ID)).not.toBeNull(),
    );
    return document.getElementById(HEADER_WORKSPACE_SELECT_ID) as HTMLSelectElement;
}

function frames(count = 40): Promise<void> {
    return act(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, count * 17));
    });
}

describe("App global workspace selector", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("scopes every view through a labelled header selector built from WorkspaceScope", async () => {
        window.history.replaceState(null, "", "/?ctid=tenant&jobs.status=failed#jobs");
        renderApp();

        const selector = await headerSelector();
        expect(selector).toHaveAccessibleName("Active workspace");
        expect(selector).toHaveValue(SAMPLE_DATA.workspace.fabricId);
        expect(
            within(selector).getAllByRole("option").map((option) => option.textContent),
        ).toEqual([SAMPLE_DATA.workspace.displayName, "Second workspace"]);

        selector.focus();
        fireEvent.change(selector, { target: { value: SECOND_WORKSPACE } });
        await frames();

        expect(selector).toHaveValue(SECOND_WORKSPACE);
        expect(selector).toHaveFocus();
        expect(window.location.hash).toBe("#jobs");
        expect(window.location.search).toContain("ctid=tenant");
        expect(window.location.search).toContain("jobs.status=failed");
    });

    it("blocks switching while a synchronization is running", async () => {
        window.history.replaceState(null, "", "/#overview");
        renderApp();
        const selector = await headerSelector();

        fireEvent.click(screen.getByRole("button", { name: "Sync" }));

        expect(selector).toBeDisabled();
        expect(selector).toHaveAccessibleDescription(
            "Cancel the active synchronization before changing workspace.",
        );
        await waitFor(() => expect(selector).toBeEnabled(), { timeout: 3_000 });
        expect(selector).toHaveValue(SAMPLE_DATA.workspace.fabricId);
    });
    it("clears workspace-bound note targets while preserving the Hub section and portal context", async () => {
        const item = SAMPLE_DATA.items.find((entry) => entry.itemType === "Lakehouse")!;
        window.history.replaceState(null, "", `/?ctid=tenant&workspace.section=notes&workspace.item=${item.fabricId}&workspace.comment=previous-note#workspace`);
        renderApp();
        const selector = await headerSelector();
        expect(screen.getByLabelText("Target")).toHaveValue(item.fabricId);
        fireEvent.change(selector, { target: { value: SECOND_WORKSPACE } });
        await waitFor(() => expect(screen.getByLabelText("Target")).toHaveValue(""));
        const params = new URL(window.location.href).searchParams;
        expect(params.has("workspace.item")).toBe(false);
        expect(params.has("workspace.comment")).toBe(false);
        expect(params.get("workspace.section")).toBe("notes");
        expect(params.get("ctid")).toBe("tenant");
    });

    it("keeps the Workspace Hub on the shell switcher and restores its section after a switch", async () => {
        window.history.replaceState(null, "", "/?workspace.section=workspace#workspace");
        renderApp();
        const selector = await headerSelector();

        expect(document.getElementById(HUB_WORKSPACE_SELECT_ID)).toBeNull();
        expect(
            screen.getAllByRole("combobox", { name: "Active workspace" }),
        ).toEqual([selector]);
        expect(screen.getByText(/Switch workspaces from the header/)).toBeInTheDocument();

        selector.focus();
        fireEvent.change(selector, { target: { value: SECOND_WORKSPACE } });
        await frames();

        expect(selector).toHaveValue(SECOND_WORKSPACE);
        expect(selector).toHaveFocus();
        expect(screen.getByRole("tab", { name: "Workspace" })).toHaveAttribute(
            "aria-selected",
            "true",
        );
        expect(window.location.search).toContain("workspace.section=workspace");
    });

    it("keeps Map & lineage and Access Review free of local workspace selectors", async () => {
        window.history.replaceState(null, "", "/#map");
        const { unmount } = renderApp();
        const selector = await headerSelector();
        expect(
            screen.getAllByRole("combobox", { name: "Active workspace" }),
        ).toEqual([selector]);
        unmount();

        window.history.replaceState(null, "", "/#access");
        renderApp();
        const accessSelector = await headerSelector();
        expect(
            screen.getAllByRole("combobox", { name: "Active workspace" }),
        ).toEqual([accessSelector]);
        expect(screen.queryByRole("combobox", { name: "Workspace" })).toBeNull();
    });

    it("offers the selector in the mobile navigation drawer and closes it after switching", async () => {
        window.history.replaceState(null, "", "/#catalog");
        renderApp();
        const header = await headerSelector();

        const trigger = screen.getByRole("button", { name: "Open navigation" });
        fireEvent.click(trigger);
        const drawer = screen.getByRole("dialog", { name: "Primary navigation" });
        const drawerSelector = within(drawer).getByRole("combobox", {
            name: "Active workspace",
        });
        expect(drawerSelector).toHaveAttribute("id", DRAWER_WORKSPACE_SELECT_ID);

        fireEvent.change(drawerSelector, { target: { value: SECOND_WORKSPACE } });

        await waitFor(() =>
            expect(
                screen.queryByRole("dialog", { name: "Primary navigation" }),
            ).toBeNull(),
        );
        expect(header).toHaveValue(SECOND_WORKSPACE);
        await waitFor(() => expect(trigger).toHaveFocus());
        expect(window.location.hash).toBe("#catalog");
    });
});
