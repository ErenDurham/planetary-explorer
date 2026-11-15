import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TopNav } from "./TopNav";
it("shows motion control only on Home", () => {
 const {rerender}=render(<TopNav active="home" onChange={vi.fn()}/>);
 expect(screen.getByRole("button",{name:"Pause visual motion"})).toBeInTheDocument();
 rerender(<TopNav active="explore" onChange={vi.fn()}/>);
 expect(screen.queryByRole("button",{name:"Pause visual motion"})).toBeNull();
});
it("visibly identifies the active advanced tool and marks its location", () => {
 const {rerender}=render(<TopNav active="analyze" onChange={vi.fn()}/>);
 const toggle=screen.getByTestId("advanced-nav");
 expect(toggle).toHaveTextContent("Analyze");
 expect(toggle).toHaveAttribute("aria-current","page");
 expect(toggle.querySelector(".sr-only")?.textContent ?? "").not.toContain("Analyze");
 rerender(<TopNav active="compare" onChange={vi.fn()}/>);
 expect(screen.getByTestId("advanced-nav")).toHaveTextContent("Compare");
});
