import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useState } from "react";
import { SitePanelShell } from "./SitePanelShell";
function Panel() {
  const [width, setWidth] = useState(380);
  return (
    <SitePanelShell width={width} onWidthChange={setWidth}>
      <p>Site data</p>
    </SitePanelShell>
  );
}
describe("Site panel", () => {
  it("collapses and reopens with buttons and keyboard, preserving content", () => {
    render(<Panel />);
    fireEvent.click(
      screen.getByRole("button", { name: "Collapse site panel" }),
    );
    expect(screen.getByText("Site data")).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Expand site panel" }));
    expect(screen.getByText("Site data")).toBeVisible();
    fireEvent.keyDown(screen.getByRole("separator"), { key: "Home" });
    expect(screen.getByText("Site data")).not.toBeVisible();
    fireEvent.keyDown(screen.getByRole("separator"), { key: "ArrowLeft" });
    expect(screen.getByText("Site data")).toBeVisible();
  });
});
