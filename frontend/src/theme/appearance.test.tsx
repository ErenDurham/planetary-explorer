import {afterEach, expect, it} from "vitest";
import {cleanup, fireEvent, render, screen} from "@testing-library/react";
import {ThemeProvider} from "./ThemeProvider";
import {TopNav} from "@/components/layout/TopNav";
import {useAppearance} from "./appearance";
afterEach(()=>{cleanup();useAppearance.setState({mode:"dark"});localStorage.removeItem("planetary-appearance");});
it("defaults to dark, switches document and portals without losing the draft, and saves the preference",()=>{
 render(<ThemeProvider><TopNav active="mission" onChange={()=>{}}/><input aria-label="Draft" defaultValue="Mars terrain"/></ThemeProvider>);
 const draft=screen.getByLabelText("Draft");
 expect(document.documentElement).toHaveAttribute("data-appearance","dark");
 fireEvent.click(screen.getByRole("button",{name:"Switch to light mode"}));
 expect(document.documentElement).toHaveAttribute("data-appearance","light");
 expect(localStorage.getItem("planetary-appearance")).toBe("light");
 expect(screen.getByLabelText("Draft")).toBe(draft);
 expect(draft).toHaveValue("Mars terrain");
 fireEvent.click(screen.getByRole("button",{name:"Switch to dark mode"}));
 expect(document.documentElement).toHaveAttribute("data-appearance","dark");
});
