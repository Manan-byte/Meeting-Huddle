import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { App } from "../App";

describe("App", () => {
  it("renders Huddle brand", () => {
    render(<App />);
    // The brand appears in the top nav and the footer mark; assert that at
    // least one is present rather than a single ambiguous text match.
    expect(screen.getAllByText("Huddle").length).toBeGreaterThan(0);
  });

  it("renders New meeting button", () => {
    render(<App />);
    // "New meeting" appears as the hero CTA and as a footer link; assert at
    // least one is present rather than a single ambiguous match.
    expect(screen.getAllByRole("button", { name: /new meeting/i }).length).toBeGreaterThan(0);
  });
});
