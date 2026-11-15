import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createPortal } from "react-dom";
import { ThemeProvider } from "./ThemeProvider";

afterEach(() => document.documentElement.removeAttribute("data-app-theme"));

describe("shared app theme", () => {
  it("switches appearance without remounting workspace drafts and reaches body portals", () => {
    function Workspace() { return <><input aria-label="Unsubmitted objective" defaultValue="" />{createPortal(<div role="tooltip">Portaled explanation</div>, document.body)}</>; }
    const { rerender } = render(<ThemeProvider><Workspace /></ThemeProvider>);
    const draft = screen.getByRole("textbox");
    fireEvent.change(draft, { target: { value: "Research a crater" } });
    expect(document.documentElement).toHaveAttribute("data-app-theme", "atlas");
    expect(screen.getByRole("tooltip").closest("html")).toBe(document.documentElement);
    rerender(<ThemeProvider theme="observatory"><Workspace /></ThemeProvider>);
    expect(document.documentElement).toHaveAttribute("data-app-theme", "observatory");
    expect(screen.getByRole("textbox")).toBe(draft);
    expect(draft).toHaveValue("Research a crater");
  });
  it("restores the host document's theme when unmounted", () => {
    document.documentElement.setAttribute("data-app-theme", "external");
    const { unmount } = render(<ThemeProvider><span>Workspace</span></ThemeProvider>);
    expect(document.documentElement).toHaveAttribute("data-app-theme", "atlas");
    unmount();
    expect(document.documentElement).toHaveAttribute("data-app-theme", "external");
  });
});
