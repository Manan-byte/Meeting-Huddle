import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { App } from "../App";

describe("App", () => {
  it("renders Huddle heading", () => {
    render(<App />);
    expect(screen.getByText("Huddle")).toBeInTheDocument();
  });

  it("renders New meeting button", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: /new meeting/i })).toBeInTheDocument();
  });
});
