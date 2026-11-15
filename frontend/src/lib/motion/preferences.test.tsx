import { afterEach, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MotionControl, useMotionPreference, useMotionStore } from "./preferences";
afterEach(() => useMotionStore.setState({ paused: false }));
it("lets the user pause and resume visual motion with an explicit control", () => {
  function Example() { const reduced = useMotionPreference("home"); return <><MotionControl /><output>{reduced ? "Still" : "Moving"}</output></>; }
  render(<Example />);
  expect(screen.getByText("Moving")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Pause visual motion" }));
  expect(screen.getByText("Still")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Resume visual motion" })).toHaveAttribute("aria-pressed", "true");
  act(() => useMotionStore.getState().setPaused(false));
  expect(screen.getByText("Moving")).toBeInTheDocument();
});

it("does not let the Home pause switch disable exploration or Astro motion", () => {
 useMotionStore.setState({paused:true});
 function Example(){const reduced=useMotionPreference();return <output>{reduced?"Still":"Moving"}</output>;}
 render(<Example/>);expect(screen.getByText("Moving")).toBeInTheDocument();
});
