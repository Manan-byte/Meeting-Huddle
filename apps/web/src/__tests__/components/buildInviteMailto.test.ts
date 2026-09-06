import { describe, it, expect } from "vitest";
import { buildInviteMailto } from "../../components/SchedulePicker";

const meeting = { title: "Sprint Planning", date: "2026-09-12", time: "09:30", code: "ABC123" };

describe("buildInviteMailto", () => {
  it("builds a mailto URL with recipients, subject, and body", () => {
    const url = buildInviteMailto(["a@x.com", "b@x.com"], meeting, "http://localhost:5173");

    expect(url).toMatch(/^mailto:a%40x\.com%2Cb%40x\.com\?/);
    expect(decodeURIComponent(url)).toContain("subject=Meeting invite: Sprint Planning");
    expect(decodeURIComponent(url)).toContain("Room code: ABC123");
    expect(decodeURIComponent(url)).toContain("http://localhost:5173/?join=ABC123");
  });

  it("works with any email provider (provider-agnostic mailto)", () => {
    const url = buildInviteMailto(["guest@yahoo.com"], meeting, "https://meet.example.com");
    expect(decodeURIComponent(url)).toContain("guest@yahoo.com");
    expect(decodeURIComponent(url)).toContain("https://meet.example.com/?join=ABC123");
  });

  it("handles an untitled meeting", () => {
    const url = buildInviteMailto(["a@x.com"], { ...meeting, title: "" }, "http://localhost:5173");
    expect(decodeURIComponent(url)).toContain("subject=Meeting invite: Untitled Meeting");
  });

  it("strips a trailing slash from the client URL", () => {
    const url = buildInviteMailto(["a@x.com"], meeting, "https://meet.example.com/");
    expect(decodeURIComponent(url)).toContain("https://meet.example.com/?join=ABC123");
    expect(decodeURIComponent(url)).not.toContain("//?");
  });
});
