import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { TimePicker } from "../../components/SchedulePicker";

/** Controlled harness — mirrors how HomePage uses TimePicker. */
function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <div>
      <TimePicker value={value} onChange={setValue} />
      <output data-testid="out">{value}</output>
    </div>
  );
}

async function pick(label: string, value: string) {
  const span = screen.getByText(label, { selector: "span" });
  const col = span.closest("div")!;
  const btn = [...col.querySelectorAll("button")].find((b) => b.textContent === value)!;
  await userEvent.click(btn);
}

describe("TimePicker", () => {
  it("emits a 24h value from hour + minute + period selections", async () => {
    render(<Harness />);

    await pick("Hour", "3");
    await pick("Min", "15");
    await pick("Period", "PM");

    // 3:15 PM → 15:15 (24h)
    expect(screen.getByTestId("out").textContent).toBe("15:15");
  });

  it("maps 12 AM to 00:00 and 12 PM to 12:00", async () => {
    render(<Harness initial="00:00" />);

    await pick("Hour", "12");
    await pick("Period", "AM");
    expect(screen.getByTestId("out").textContent).toBe("00:00");

    await pick("Period", "PM");
    expect(screen.getByTestId("out").textContent).toBe("12:00");
  });

  it("keeps minute when only the period changes", async () => {
    render(<Harness initial="08:30" />);

    await pick("Period", "PM");
    expect(screen.getByTestId("out").textContent).toBe("20:30");
  });

  it("highlights the selected hour and period", () => {
    render(<Harness initial="09:15" />);

    const selected = screen
      .getAllByRole("button")
      .filter((b) => (b.style.background || "").includes("var(--accent)"));
    const labels = selected.map((b) => b.textContent);
    expect(labels).toContain("9");
    expect(labels).toContain("AM");
  });
});