//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { beforeEach, describe, it, expect, vi } from "vitest";
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import App from "@/App";
import { workspaceDetailLabel } from "@/atlas/workspace-display";
import { AtlasProvider } from "@/atlas/store";
import { ThemeContext } from "@/hooks/theme.context";

vi.mock("@/atlas/components/PostureRadar", () => ({
    PostureRadar: () => <figure aria-label="Governance posture radar" />,
}));

function renderApp() {
    return render(
        <ThemeContext.Provider value={{ isDark: false, toggleTheme: () => undefined }}>
            <AtlasProvider isPreview>
                <App />
            </AtlasProvider>
        </ThemeContext.Provider>,
    );
}

describe("App", () => {
    beforeEach(() => {
        window.history.replaceState(null, "", "/#overview");
        localStorage.clear();
    });

    it("renders without throwing", () => {
        expect(() => renderApp()).not.toThrow();
    });

    it("never exposes UUID-like workspace capacity text", () => {
        expect(
            workspaceDetailLabel({
                fabricId: "workspace",
                displayName: "Workspace",
                capacity: "786e0b3d-9718-423d-a4cb-a778cb824a23",
                region: "West Europe",
            }),
        ).toBe("West Europe");
        expect(
            workspaceDetailLabel({
                fabricId: "workspace",
                displayName: "Workspace",
                capacity: "F16 · West Europe",
                region: "West Europe",
            }),
        ).toBe("F16 · West Europe");
    });

    it("mounts content into the document", () => {
        renderApp();
        expect(document.body).not.toBeEmptyDOMElement();
    });

    it("shows the single scoped workspace name without a selector", async () => {
        renderApp();
        await act(async () => undefined);
        expect(
            screen.queryByRole("combobox", { name: "Active workspace" }),
        ).toBeNull();
        expect(screen.getByRole("banner")).toHaveTextContent(
            "AlpineRent",
        );
    });

    it("applies and restores the personal display density", () => {
        const app = renderApp();
        expect(document.documentElement).toHaveAttribute("data-atlas-density", "comfortable");
        fireEvent.click(screen.getByRole("button", { name: "Switch to compact density" }));
        expect(document.documentElement).toHaveAttribute("data-atlas-density", "compact");
        app.unmount();
        renderApp();
        expect(document.documentElement).toHaveAttribute("data-atlas-density", "compact");
        fireEvent.click(screen.getByRole("button", { name: "Switch to comfortable density" }));
        expect(document.documentElement).toHaveAttribute("data-atlas-density", "comfortable");
    });

    it("opens the grouped Governance Center from the sidebar", async () => {
        renderApp();
        fireEvent.click(screen.getByRole("button", { name: "Governance Center" }));
        expect(
            await screen.findByRole("heading", { name: "Governance Center" }),
        ).toBeInTheDocument();
    });

    it("opens global search with Ctrl+K", () => {
        renderApp();
        fireEvent.keyDown(window, { key: "k", ctrlKey: true });
        expect(
            screen.getByRole("dialog", { name: "Search Fabric Atlas" }),
        ).toBeInTheDocument();
    });

    it("manages mobile navigation as a focus-restoring dialog", async () => {
        renderApp();
        const trigger = screen.getByRole("button", { name: "Open navigation" });
        fireEvent.click(trigger);

        expect(
            screen.getByRole("dialog", { name: "Primary navigation" }),
        ).toBeInTheDocument();
        expect(trigger).toHaveAttribute("aria-expanded", "true");

        fireEvent.keyDown(document, { key: "Escape" });
        expect(
            screen.queryByRole("dialog", { name: "Primary navigation" }),
        ).not.toBeInTheDocument();
        await waitFor(() => expect(trigger).toHaveFocus());
    });

    it("canonicalizes legacy routes and keeps one main landmark", async () => {
        window.history.replaceState(null, "", "/#comments");
        renderApp();

        expect(
            await screen.findByRole("tab", { name: /Team notes/ }),
        ).toHaveAttribute("aria-selected", "true");
        expect(screen.getAllByRole("main")).toHaveLength(1);
        expect(document.title).toBe("Workspace Hub | Fabric Atlas");
    });

    it("keeps one compact run status in the header on every route during a run", async () => {
        window.history.replaceState(null, "", "/#workspace");
        renderApp();

        fireEvent.click(
            await screen.findByRole("button", { name: "Synchronize now" }),
        );
        expect(
            await screen.findByRole("heading", {
                name: "Synchronization is running in this browser tab",
            }),
        ).toBeInTheDocument();
        const main = screen.getByRole("main");
        const header = main.parentElement!.querySelector(
            ":scope > header",
        ) as HTMLElement;
        expect(header).not.toBeNull();
        const expectCompactLayout = () => {
            expect(
                screen.queryByRole("region", {
                    name: "Workspace synchronization status",
                }),
            ).toBeNull();
            expect(main.previousElementSibling).toBe(header);
            expect(within(header).getByRole("status").textContent).toMatch(/%|synced/);
        };
        expectCompactLayout();

        fireEvent.mouseDown(screen.getByRole("tab", { name: "Configuration" }));
        await screen.findByRole("tab", { name: "Configuration", selected: true });
        expectCompactLayout();

        fireEvent.click(screen.getByRole("button", { name: "Overview" }));
        await waitFor(() =>
            expect(document.title).toBe("Overview | Fabric Atlas"),
        );
        expectCompactLayout();
    });

    it("opens Overview signals with shareable filters", async () => {
        renderApp();
        fireEvent.click(
            screen.getByRole("button", { name: /External access:/ }),
        );

        expect(
            await screen.findByRole("heading", { name: /Access review/i }),
        ).toBeInTheDocument();
        expect(new URL(window.location.href).searchParams.get("access.risk")).toBe(
            "external",
        );
        expect(window.location.hash).toBe("#access");
    });

    it("restores and updates routed job filters", () => {
        window.history.replaceState(
            null,
            "",
            "/?jobs.status=failed#jobs",
        );
        renderApp();

        expect(screen.getByLabelText("Filter jobs by status")).toHaveValue(
            "failed",
        );
        fireEvent.change(screen.getByLabelText("Search job history"), {
            target: { value: "refresh" },
        });
        expect(new URL(window.location.href).searchParams.get("jobs.q")).toBe(
            "refresh",
        );
    });

    it("focuses main content without changing the routed hash", () => {
        window.history.replaceState(null, "", "/#jobs");
        renderApp();
        fireEvent.click(
            screen.getByRole("button", { name: "Skip to main content" }),
        );

        expect(window.location.hash).toBe("#jobs");
        expect(screen.getByRole("main")).toHaveFocus();
    });

    it("does not add duplicate history entries for the active route", () => {
        const pushState = vi.spyOn(window.history, "pushState");
        renderApp();
        fireEvent.click(screen.getByRole("button", { name: "Overview" }));

        expect(pushState).not.toHaveBeenCalled();
        pushState.mockRestore();
    });

    it("lets the Catalog drawer keep modal focus", async () => {
        const itemId = "10000000-0000-4000-8000-000000000001";
        window.history.replaceState(
            null,
            "",
            `/?catalog.item=${itemId}#catalog`,
        );
        renderApp();

        const dialog = await screen.findByRole("dialog", {
            name: /details/,
        });
        await waitFor(() => expect(dialog).toHaveFocus());
        expect(document.activeElement).toBe(dialog);
    });

    it("opens a searched Catalog item without stealing modal focus", async () => {
        renderApp();
        fireEvent.keyDown(window, { key: "k", ctrlKey: true });
        fireEvent.change(
            screen.getByRole("combobox", {
                name: "Search workspace metadata",
            }),
            { target: { value: "alpinerent_lakehouse" } },
        );
        fireEvent.click(
            (await screen.findAllByRole("option", {
                name: /alpinerent_lakehouse/,
            }))[0],
        );

        const dialog = await screen.findByRole("dialog", {
            name: /alpinerent_lakehouse details/,
        });
        await waitFor(() => expect(dialog).toHaveFocus());
        expect(window.location.hash).toBe("#catalog");
        expect(
            new URL(window.location.href).searchParams.get("catalog.item"),
        ).toBeTruthy();
    });

    it("closes mobile navigation when the desktop breakpoint activates", async () => {
        let matches = false;
        let listener: (() => void) | undefined;
        const originalMatchMedia = window.matchMedia;
        window.matchMedia = vi.fn().mockImplementation(() => ({
            get matches() {
                return matches;
            },
            media: "(min-width: 1024px)",
            onchange: null,
            addEventListener: (_type: string, callback: () => void) => {
                listener = callback;
            },
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));
        renderApp();
        fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
        expect(
            screen.getByRole("dialog", { name: "Primary navigation" }),
        ).toBeInTheDocument();

        matches = true;
        await act(async () => listener?.());
        await waitFor(() =>
            expect(
                screen.queryByRole("dialog", { name: "Primary navigation" }),
            ).not.toBeInTheDocument(),
        );
        await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
        window.matchMedia = originalMatchMedia;
    });
});
