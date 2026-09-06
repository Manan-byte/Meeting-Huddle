import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { VideoPlayer } from "../../components/VideoPlayer";

describe("VideoPlayer", () => {
  it("shows video element when stream is provided", () => {
    const stream = {
      getTracks: () => [],
    } as unknown as MediaStream;

    render(
      <VideoPlayer stream={stream} name="John Doe" isMuted={false} isVideoOff={false} />,
    );

    const video = document.querySelector("video");
    expect(video).toBeInTheDocument();
  });

  it("shows initials when video is off", () => {
    render(
      <VideoPlayer stream={null} name="John Doe" isMuted={false} isVideoOff={true} />,
    );

    expect(screen.getByText("JD")).toBeInTheDocument();
    expect(document.querySelector("video")).not.toBeInTheDocument();
  });

  it("shows initials when no stream is provided", () => {
    render(
      <VideoPlayer stream={null} name="Jane Smith" isMuted={false} isVideoOff={false} />,
    );

    expect(screen.getByText("JS")).toBeInTheDocument();
  });

  it("displays name overlay", () => {
    render(
      <VideoPlayer stream={null} name="Alice" isMuted={false} isVideoOff={true} />,
    );

    expect(screen.getByText("Alice")).toBeInTheDocument();
  });
});
