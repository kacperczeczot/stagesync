import { describe, expect, it } from "vitest";
import { createProjectV6Seed } from "@stagesync/shared";
import {
  commitContentGesture,
  commitMoveContentClips,
  commitPencilContentSpan,
  contentAsForma,
  contentClipCoveringTicks,
  defaultPencilLabel,
  joinAdjacentContentClips,
  previewContentFromSession,
  resolveSplitParentId,
  splitContentClipAt,
} from "./contentLaneEdit.js";
import { pencilTekstClick } from "./tekstEdit.js";
import { pencilAkordyClick } from "./akordyEdit.js";
import { pencilCueClick } from "./cueEdit.js";
import type { FormaGestureSession } from "@lib/timeline/timelineGesture.js";

describe("contentLaneEdit remaining", () => {
  it("covers akordy/cue hit-test, split, multi-move, pencil edges, gestures", () => {
    expect(defaultPencilLabel("tekst")).toBe("…");
    expect(defaultPencilLabel("akordy")).toBe("C");
    expect(defaultPencilLabel("cue")).toBe("Cue");
    expect(resolveSplitParentId("a-r-r")).toBe("a");
    expect(resolveSplitParentId("clip-1-r-2")).toBe("clip-1");
    expect(resolveSplitParentId("plain")).toBe("plain");

    let p = createProjectV6Seed("p", "S", "2026-07-20T12:00:00.000Z");
    p = pencilAkordyClick(p, 0, "G");
    p = pencilCueClick(p, 0, "Go");
    expect(contentClipCoveringTicks(p, "akordy", 1)?.id).toBe(
      p.akordy.clips[0]!.id,
    );
    expect(contentClipCoveringTicks(p, "cue", 1)?.id).toBe(p.cue.clips[0]!.id);

    p = pencilTekstClick(p, 0, "A");
    const tid = p.tekst.clips[0]!.id;
    const split = splitContentClipAt(p, "tekst", tid, 1920, "off");
    expect(split.tekst.clips.length).toBeGreaterThan(1);
    expect(split.tekst.clips.every((c) => c.blocks.length >= 1)).toBe(true);
    expect(splitContentClipAt(p, "tekst", "missing", 100)).toBe(p);

    p = pencilTekstClick(
      createProjectV6Seed("p2", "S", "2026-07-20T12:00:00.000Z"),
      0,
      "A",
    );
    p = pencilTekstClick(p, 3840, "B");
    const a = p.tekst.clips.find((c) => c.text === "A")!;
    const b = p.tekst.clips.find((c) => c.text === "B")!;
    expect(
      commitMoveContentClips(
        p,
        "tekst",
        [a.id],
        a.id,
        7680,
        "bar",
      ).tekst.clips.find((c) => c.id === a.id)!.startTicks,
    ).toBe(7680);
    expect(
      commitMoveContentClips(p, "tekst", [a.id, b.id], "missing", 100, "off"),
    ).toBe(p);
    expect(
      commitMoveContentClips(
        p,
        "tekst",
        [a.id, b.id],
        a.id,
        a.startTicks,
        "off",
      ),
    ).toBe(p);
    const multi = commitMoveContentClips(
      p,
      "tekst",
      [a.id, b.id],
      a.id,
      7680,
      "bar",
    );
    expect(multi.tekst.clips.find((c) => c.id === a.id)!.startTicks).toBe(7680);
    expect(
      multi.tekst.clips.find((c) => c.id === a.id)!.blocks[0]!.startTicks,
    ).toBe(7680);

    expect(contentAsForma(p, "tekst")[0]!.kind).toBe("section");

    const swapped = commitPencilContentSpan(p, "tekst", 7680, 0, "bar");
    expect(swapped.tekst.clips.some((c) => c.startTicks === 0)).toBe(true);
    const tiny = commitPencilContentSpan(p, "akordy", 7680, 7680, "off");
    expect(tiny.akordy.clips[0]!.lengthTicks).toBeGreaterThanOrEqual(1);
    const overCue = commitPencilContentSpan(
      {
        ...p,
        cue: {
          clips: [
            {
              id: "c1",
              startTicks: 0,
              lengthTicks: 7680,
              label: "Old",
              roles: ["grid"],
              priority: "alert",
            },
          ],
        },
      },
      "cue",
      0,
      3840,
      "bar",
    );
    expect(
      overCue.cue.clips.some((c) => c.label === "Cue" || c.label === "Old"),
    ).toBe(true);

    const sessionMove: FormaGestureSession = {
      kind: "move",
      clipId: a.id,
      pointerId: 1,
      originTicks: 0,
      originClipStart: 0,
      originClipLength: 3840,
      moveIds: [a.id, b.id],
    };
    const moved = commitContentGesture(
      p,
      "tekst",
      sessionMove,
      { kind: "move", clipId: a.id, startTicks: 7680, lengthTicks: 3840 },
      false,
      false,
    );
    expect(moved.tekst.clips.find((c) => c.id === a.id)!.startTicks).toBe(7680);
    expect(
      commitContentGesture(
        p,
        "tekst",
        { ...sessionMove, clipId: null },
        { kind: "move", clipId: null, startTicks: 0, lengthTicks: 1 },
        false,
        false,
      ),
    ).toBe(p);
    expect(
      commitContentGesture(
        p,
        "tekst",
        {
          kind: "resize-start",
          clipId: null,
          pointerId: 1,
          originTicks: 0,
          originClipStart: 0,
          originClipLength: 1,
        },
        { kind: "resize-start", clipId: null, startTicks: 0, lengthTicks: 1 },
        false,
        false,
      ),
    ).toBe(p);
    expect(
      commitContentGesture(
        p,
        "tekst",
        {
          kind: "resize-end",
          clipId: null,
          pointerId: 1,
          originTicks: 0,
          originClipStart: 0,
          originClipLength: 1,
        },
        { kind: "resize-end", clipId: null, startTicks: 0, lengthTicks: 1 },
        false,
        false,
      ),
    ).toBe(p);
    const rs = commitContentGesture(
      p,
      "tekst",
      {
        kind: "resize-start",
        clipId: a.id,
        pointerId: 1,
        originTicks: 0,
        originClipStart: 0,
        originClipLength: a.lengthTicks,
      },
      {
        kind: "resize-start",
        clipId: a.id,
        startTicks: 960,
        lengthTicks: a.lengthTicks - 960,
      },
      true,
      false,
    );
    expect(rs.tekst.clips.find((c) => c.id === a.id)!.startTicks).toBe(960);
    const re = commitContentGesture(
      p,
      "tekst",
      {
        kind: "resize-end",
        clipId: a.id,
        pointerId: 1,
        originTicks: a.lengthTicks,
        originClipStart: 0,
        originClipLength: a.lengthTicks,
      },
      { kind: "resize-end", clipId: a.id, startTicks: 0, lengthTicks: 7680 },
      false,
      false,
    );
    expect(re.tekst.clips.find((c) => c.id === a.id)!.lengthTicks).toBe(7680);
    expect(
      commitContentGesture(
        p,
        "tekst",
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

    const pencil: FormaGestureSession = {
      kind: "pencil-draw",
      clipId: null,
      pointerId: 1,
      originTicks: 0,
      originClipStart: 0,
      originClipLength: 0,
      lane: "tekst",
    };
    expect(
      previewContentFromSession(p, pencil, 0, false, false).lengthTicks,
    ).toBeGreaterThan(0);
    expect(
      previewContentFromSession(p, pencil, 7680, false, false).lengthTicks,
    ).toBeGreaterThan(0);
    expect(
      previewContentFromSession(
        p,
        { ...pencil, originClientX: 1 },
        100,
        false,
        false,
        50,
      ).kind,
    ).toBe("pencil-draw");
    const rStart = previewContentFromSession(
      p,
      {
        kind: "resize-start",
        clipId: a.id,
        pointerId: 1,
        originTicks: 0,
        originClipStart: 0,
        originClipLength: 10,
      },
      10_000,
      true,
      false,
    );
    expect(rStart.lengthTicks).toBe(1);
    const rEnd = previewContentFromSession(
      p,
      {
        kind: "resize-end",
        clipId: a.id,
        pointerId: 1,
        originTicks: 0,
        originClipStart: 100,
        originClipLength: 50,
      },
      50,
      true,
      false,
    );
    expect(rEnd.lengthTicks).toBe(1);

    const singleMove = commitContentGesture(
      p,
      "tekst",
      {
        kind: "move",
        clipId: a.id,
        pointerId: 1,
        originTicks: 0,
        originClipStart: 0,
        originClipLength: 3840,
      },
      { kind: "move", clipId: a.id, startTicks: 11520, lengthTicks: 3840 },
      false,
      false,
    );
    expect(singleMove.tekst.clips.find((c) => c.id === a.id)!.startTicks).toBe(
      11520,
    );

    let base = createProjectV6Seed("p3", "S", "2026-07-20T12:00:00.000Z");
    base = pencilTekstClick(base, 0, "Keep");
    const overTekst = commitPencilContentSpan(base, "tekst", 1920, 5760, "off");
    expect(
      overTekst.tekst.clips.some(
        (c) => c.text === "Keep" || c.id.includes("-r"),
      ),
    ).toBe(true);
    expect(overTekst.tekst.clips.every((c) => c.blocks.length >= 1)).toBe(true);
    base = pencilAkordyClick(
      createProjectV6Seed("p4", "S", "2026-07-20T12:00:00.000Z"),
      0,
      "Em",
    );
    const overAk = commitPencilContentSpan(base, "akordy", 1920, 5760, "off");
    expect(
      overAk.akordy.clips.some((c) => c.symbol === "Em" || c.symbol === "C"),
    ).toBe(true);
  });

  it("joinAdjacentContentClips merges abutting blocks", () => {
    let p = createProjectV6Seed("p", "S", "2026-07-20T12:00:00.000Z");
    p = pencilTekstClick(p, 0, "A");
    p = pencilTekstClick(p, 3840, "B");
    const a = p.tekst.clips.find((c) => c.text === "A")!;
    const b = p.tekst.clips.find((c) => c.text === "B")!;
    p = {
      ...p,
      tekst: {
        ...p.tekst,
        clips: [
          { ...a, startTicks: 0, lengthTicks: 3840 },
          { ...b, startTicks: 3840, lengthTicks: 3840 },
        ],
      },
    };
    const joined = joinAdjacentContentClips(p, "tekst", a.id);
    expect(joined.tekst.clips).toHaveLength(1);
    expect(joined.tekst.clips[0]!.id).toBe(a.id);
    expect(joined.tekst.clips[0]!.lengthTicks).toBe(7680);
    expect(joined.tekst.clips[0]!.text).toBe("A");
    expect(joined.tekst.clips[0]!.blocks).toHaveLength(2);
    expect(joined.tekst.clips[0]!.blocks.map((x) => x.text)).toEqual([
      "A",
      "B",
    ]);

    expect(joinAdjacentContentClips(p, "tekst", "missing")).toBe(p);
    const gap = {
      ...p,
      tekst: {
        ...p.tekst,
        clips: [
          { ...a, startTicks: 0, lengthTicks: 3840 },
          { ...b, startTicks: 4000, lengthTicks: 3840 },
        ],
      },
    };
    expect(joinAdjacentContentClips(gap, "tekst", a.id)).toBe(gap);

    const fromRight = joinAdjacentContentClips(
      {
        ...p,
        tekst: {
          ...p.tekst,
          clips: [
            { ...a, startTicks: 0, lengthTicks: 3840 },
            { ...b, startTicks: 3840, lengthTicks: 3840 },
          ],
        },
      },
      "tekst",
      b.id,
    );
    expect(fromRight.tekst.clips).toHaveLength(1);
    expect(fromRight.tekst.clips[0]!.id).toBe(a.id);
    expect(fromRight.tekst.clips[0]!.blocks).toHaveLength(2);
  });
});
