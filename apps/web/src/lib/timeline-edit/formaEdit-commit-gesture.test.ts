import { describe, expect, it } from "vitest";
import { createProjectSeed } from "@stagesync/shared";
import {
  cascadeFormaMoveIds,
  commitGesture,
  commitPencilSpan,
  insertFormaSubsectionAt,
  joinFormaAtClick,
} from "./formaEdit.js";
import type { FormaGestureSession } from "@lib/timeline/timelineGesture.js";

function seed() {
  return createProjectSeed("p1", "Song", "2026-07-20T12:00:00.000Z");
}

describe("formaEdit commitGesture and join", () => {
  it("commitGesture covers move/resize/subsection/default guards", () => {
    const p = seed();
    const withSub = insertFormaSubsectionAt(p, "forma-intro", 3840);
    const moveSession: FormaGestureSession = {
      kind: "move",
      clipId: null,
      pointerId: 1,
      originTicks: 0,
      originClipStart: 0,
      originClipLength: 7680,
    };
    expect(
      commitGesture(
        p,
        moveSession,
        { kind: "move", clipId: null, startTicks: 0, lengthTicks: 7680 },
        false,
        false,
      ),
    ).toBe(p);

    const moveOk: FormaGestureSession = {
      kind: "move",
      clipId: "forma-intro",
      pointerId: 1,
      originTicks: 0,
      originClipStart: 0,
      originClipLength: 7680,
    };
    const moved = commitGesture(
      p,
      moveOk,
      {
        kind: "move",
        clipId: "forma-intro",
        startTicks: 3840,
        lengthTicks: 7680,
      },
      false,
      false,
    );
    expect(
      moved.forma.clips.find((c) => c.id === "forma-intro")!.startTicks,
    ).toBe(3840);

    // ensure multi path: add another section
    const withB = commitPencilSpan(p, 7680, 15360, "B", "bar");
    const ids = cascadeFormaMoveIds(withB.forma.clips, "forma-intro");
    const multi = commitGesture(
      withB,
      { ...moveOk, moveIds: ids },
      {
        kind: "move",
        clipId: "forma-intro",
        startTicks: 3840,
        lengthTicks: 7680,
      },
      false,
      false,
    );
    expect(multi).not.toBe(withB);

    for (const kind of ["resize-start", "resize-end"] as const) {
      expect(
        commitGesture(
          p,
          {
            kind,
            clipId: null,
            pointerId: 1,
            originTicks: 0,
            originClipStart: 0,
            originClipLength: 7680,
          },
          { kind, clipId: null, startTicks: 0, lengthTicks: 7680 },
          false,
          false,
        ),
      ).toBe(p);
    }
    const rs = commitGesture(
      p,
      {
        kind: "resize-start",
        clipId: "forma-intro",
        pointerId: 1,
        originTicks: 0,
        originClipStart: 0,
        originClipLength: 7680,
      },
      {
        kind: "resize-start",
        clipId: "forma-intro",
        startTicks: 1920,
        lengthTicks: 5760,
      },
      true,
      false,
    );
    expect(rs.forma.clips.find((c) => c.id === "forma-intro")!.startTicks).toBe(
      1920,
    );
    const re = commitGesture(
      p,
      {
        kind: "resize-end",
        clipId: "forma-intro",
        pointerId: 1,
        originTicks: 7680,
        originClipStart: 0,
        originClipLength: 7680,
      },
      {
        kind: "resize-end",
        clipId: "forma-intro",
        startTicks: 0,
        lengthTicks: 11520,
      },
      false,
      false,
    );
    expect(
      re.forma.clips.find((c) => c.id === "forma-intro")!.lengthTicks,
    ).toBe(11520);

    expect(
      commitGesture(
        p,
        {
          kind: "countdown-length",
          clipId: null,
          pointerId: 1,
          originTicks: 0,
          originClipStart: -7680,
          originClipLength: 7680,
        },
        {
          kind: "countdown-length",
          clipId: null,
          startTicks: -7680,
          lengthTicks: 7680,
        },
        false,
        false,
      ),
    ).toBe(p);

    // fallback setCountdownBars when boundary apply returns same project
    const cdSame = commitGesture(
      p,
      {
        kind: "countdown-length",
        clipId: "forma-cd",
        pointerId: 1,
        originTicks: 0,
        originClipStart: -7680,
        originClipLength: 7680,
      },
      {
        kind: "countdown-length",
        clipId: "forma-cd",
        startTicks: -7680,
        lengthTicks: 7680,
      },
      false,
      false,
    );
    expect(
      cdSame.forma.clips.find((c) => c.kind === "countdown")!.lengthTicks,
    ).toBe(7680);

    expect(
      commitGesture(
        withSub,
        {
          kind: "subsection-boundary",
          clipId: null,
          pointerId: 1,
          originTicks: 0,
          originClipStart: 0,
          originClipLength: 7680,
        },
        {
          kind: "subsection-boundary",
          clipId: null,
          startTicks: 0,
          lengthTicks: 7680,
          subsections: [1920],
        },
        false,
        false,
      ),
    ).toBe(withSub);
    expect(
      commitGesture(
        withSub,
        {
          kind: "subsection-boundary",
          clipId: "missing",
          pointerId: 1,
          originTicks: 0,
          originClipStart: 0,
          originClipLength: 7680,
        },
        {
          kind: "subsection-boundary",
          clipId: "missing",
          startTicks: 0,
          lengthTicks: 7680,
          subsections: [1],
        },
        false,
        false,
      ),
    ).toBe(withSub);
    expect(
      commitGesture(
        withSub,
        {
          kind: "subsection-boundary",
          clipId: "forma-intro",
          pointerId: 1,
          originTicks: 0,
          originClipStart: 0,
          originClipLength: 7680,
        },
        {
          kind: "subsection-boundary",
          clipId: "forma-intro",
          startTicks: 0,
          lengthTicks: 7680,
          subsections: [3840],
        },
        false,
        false,
      ),
    ).toBe(withSub);
    const subChanged = commitGesture(
      withSub,
      {
        kind: "subsection-boundary",
        clipId: "forma-intro",
        pointerId: 1,
        originTicks: 0,
        originClipStart: 0,
        originClipLength: 7680,
      },
      {
        kind: "subsection-boundary",
        clipId: "forma-intro",
        startTicks: 0,
        lengthTicks: 7680,
        subsections: [1920],
      },
      false,
      false,
    );
    expect(
      subChanged.forma.clips.find((c) => c.id === "forma-intro")?.subsections,
    ).toEqual([1920]);
    const cleared = commitGesture(
      withSub,
      {
        kind: "subsection-boundary",
        clipId: "forma-intro",
        pointerId: 1,
        originTicks: 0,
        originClipStart: 0,
        originClipLength: 7680,
      },
      {
        kind: "subsection-boundary",
        clipId: "forma-intro",
        startTicks: 0,
        lengthTicks: 7680,
        subsections: [],
      },
      false,
      false,
    );
    expect(
      cleared.forma.clips.find((c) => c.id === "forma-intro")?.subsections,
    ).toBeUndefined();

    expect(
      commitGesture(
        p,
        {
          kind: "fade-in",
          clipId: "x",
          pointerId: 1,
          originTicks: 0,
          originClipStart: 0,
          originClipLength: 1,
        },
        { kind: "fade-in", clipId: "x", startTicks: 0, lengthTicks: 1 },
        false,
        false,
      ),
    ).toBe(p);
  });

  it("joinFormaAtClick merges abutting sections and clears subsections", () => {
    const p = seed();
    expect(joinFormaAtClick(p, "missing", 0)).toBe(p);
    expect(joinFormaAtClick(p, "forma-cd", 0)).toBe(p);

    const withSub = insertFormaSubsectionAt(p, "forma-intro", 3840);
    const cleared = joinFormaAtClick(withSub, "forma-intro", 3840);
    expect(
      cleared.forma.clips.find((c) => c.id === "forma-intro")?.subsections,
    ).toBeUndefined();

    const withB = commitPencilSpan(p, 7680, 15360, "B", "bar");
    const intro = withB.forma.clips.find((c) => c.id === "forma-intro")!;
    const b = withB.forma.clips.find((c) => c.name === "B")!;
    expect(b.startTicks).toBe(intro.startTicks + intro.lengthTicks);
    const merged = joinFormaAtClick(withB, intro.id, intro.startTicks + 1);
    expect(merged.forma.clips.filter((c) => c.kind === "section")).toHaveLength(
      1,
    );
    const only = merged.forma.clips.find((c) => c.kind === "section")!;
    expect(only.id).toBe(intro.id);
    expect(only.lengthTicks).toBe(intro.lengthTicks + b.lengthTicks);
    expect(only.subsections).toBeUndefined();

    const fromRight = joinFormaAtClick(withB, b.id, b.startTicks + 1);
    expect(fromRight.forma.clips.find((c) => c.kind === "section")!.id).toBe(
      intro.id,
    );

    const gapped = {
      ...withB,
      forma: {
        clips: withB.forma.clips.map((c) =>
          c.name === "B" ? { ...c, startTicks: c.startTicks + 100 } : c,
        ),
      },
    };
    expect(joinFormaAtClick(gapped, intro.id, 0)).toBe(gapped);
  });
});
