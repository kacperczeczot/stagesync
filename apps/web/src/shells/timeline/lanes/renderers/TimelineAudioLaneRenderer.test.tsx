// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TimelineAudioLaneRenderer } from "./TimelineAudioLaneRenderer.js";
import type { Project } from "@stagesync/shared";

describe("TimelineAudioLaneRenderer", () => {
  const dummyProject: Project = {
    id: "p1",
    name: "Song",
    formatVersion: 6,
    updatedAt: new Date().toISOString(),
    ppq: 960,
    defaultBpm: 120,
    defaultMeter: { numerator: 4, denominator: 4 },
    forma: { clips: [] },
    tempoMap: [],
    meterMap: [],
    keyMap: [],
    akordy: { clips: [] },
    tekst: { clips: [] },
    melody: { clips: [] },
    cue: { clips: [] },
    scoreBarMap: { anchors: [] },
    audioTracks: [
      { id: "trk1", name: "Drums", muted: false, color: "#E74C3C" },
    ],
    audioClips: [
      {
        id: "ac1",
        trackId: "trk1",
        assetId: "ast1",
        startTicks: 0,
        lengthTicks: 3840,
        muted: false,
      },
    ],
    assets: [
      {
        id: "ast1",
        storageName: "ast1.wav",
        originalName: "drums.wav",
        kind: "audio",
        mimeType: "audio/wav",
        sizeBytes: 1000,
        durationMs: 4000,
        waveformPeaks: [0.1, 0.5, 0.9, 0.3],
      },
    ],
  };

  it("renders audio clip button and responds to pointer events and context menu", () => {
    const onAudioClipPointerDown = vi.fn();
    const onFormaClipPointerMove = vi.fn();
    const onFormaClipPointerUp = vi.fn();
    const openClipContextMenu = vi.fn();

    render(
      <TimelineAudioLaneRenderer
        lane="audio:trk1"
        draftProject={dummyProject}
        projectId="p1"
        failedAudioAssetIds={[]}
        gestureSession={null}
        gesturePreview={null}
        clipSelection={{ items: [], primaryId: null }}
        viewSpan={{ start: 0, end: 7680 }}
        barTicks={1920}
        effectiveZoomH={1}
        openClipContextMenu={openClipContextMenu}
        onAudioClipPointerDown={onAudioClipPointerDown}
        onFormaClipPointerMove={onFormaClipPointerMove}
        onFormaClipPointerUp={onFormaClipPointerUp}
      />,
    );

    const clipBtn = screen.getByRole("button", { name: /drums\.wav/i });
    expect(clipBtn).toBeTruthy();

    fireEvent.pointerDown(clipBtn);
    expect(onAudioClipPointerDown).toHaveBeenCalled();

    fireEvent.contextMenu(clipBtn);
    expect(openClipContextMenu).toHaveBeenCalled();
  });

  it("gainDbToLaneY centers 0 dB, boosts towards top, cuts towards bottom without dead zones", async () => {
    const { gainDbToLaneY } = await import("./TimelineAudioLaneRenderer.js");
    expect(gainDbToLaneY(0, 28)).toBe(14);
    expect(gainDbToLaneY(24, 28)).toBe(3);
    expect(gainDbToLaneY(-60, 28)).toBe(25);
    // Monotonicity: higher dB -> higher on screen (lower Y value)
    expect(gainDbToLaneY(6, 28)).toBeLessThan(gainDbToLaneY(0, 28));
    expect(gainDbToLaneY(-12, 28)).toBeGreaterThan(gainDbToLaneY(0, 28));
    expect(gainDbToLaneY(-30, 28)).toBeGreaterThan(gainDbToLaneY(-12, 28));
  });

  it("moves gain line and fade overlay in real-time during live gesture preview", async () => {
    const { gainDbToLaneY } = await import("./TimelineAudioLaneRenderer.js");
    const { container } = render(
      <TimelineAudioLaneRenderer
        lane="audio:trk1"
        draftProject={dummyProject}
        projectId="p1"
        failedAudioAssetIds={[]}
        gestureSession={{
          kind: "gain",
          clipId: "ac1",
          originClipStart: 0,
          lane: "audio:trk1",
          hasDragged: true,
        }}
        gesturePreview={{
          kind: "gain",
          clipId: "ac1",
          startTicks: 0,
          lengthTicks: 3840,
          gainDb: 12,
        }}
        clipSelection={{ items: [], primaryId: null }}
        viewSpan={{ start: 0, end: 7680 }}
        barTicks={1920}
        effectiveZoomH={1}
        openClipContextMenu={vi.fn()}
        onAudioClipPointerDown={vi.fn()}
        onFormaClipPointerMove={vi.fn()}
        onFormaClipPointerUp={vi.fn()}
      />,
    );

    const gainLines = container.querySelectorAll("line");
    expect(gainLines.length).toBeGreaterThan(0);
    const gainLine = Array.from(gainLines).find((l) =>
      l.getAttribute("class")?.includes("audioGainLine"),
    );
    expect(gainLine).toBeTruthy();
    // In preview with +12 dB, Y should be gainDbToLaneY(12) = 8.5
    expect(Number(gainLine?.getAttribute("y1"))).toBeCloseTo(gainDbToLaneY(12, 28), 1);
  });
});
