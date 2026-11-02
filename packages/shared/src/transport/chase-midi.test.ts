import { describe, expect, it } from "vitest";
import { chaseMidiNotes, ChasedMidiNoteSchema } from "./chase-midi.js";
import type { MelodyNoteClip } from "../project/schema/clips.js";

describe("chaseMidiNotes", () => {
  const clips: MelodyNoteClip[] = [
    { id: "n1", pitchMidi: 60, startTicks: 0, lengthTicks: 960 }, // 0 to 960
    { id: "n2", pitchMidi: 64, startTicks: 480, lengthTicks: 960 }, // 480 to 1440
    { id: "n3", pitchMidi: 67, startTicks: 960, lengthTicks: 480 }, // 960 to 1440
    { id: "n4", pitchMidi: 72, startTicks: 1920, lengthTicks: 480 }, // 1920 to 2400
  ];

  it("chases notes spanning seekTicks", () => {
    // At seekTicks = 500: n1 (0-960) and n2 (480-1440) are active
    const chased = chaseMidiNotes(clips, 500);

    expect(chased).toHaveLength(2);

    expect(chased[0]!.id).toBe("n1");
    expect(chased[0]!.pitchMidi).toBe(60);
    expect(chased[0]!.startTicks).toBe(0);
    expect(chased[0]!.originalLengthTicks).toBe(960);
    expect(chased[0]!.seekTicks).toBe(500);
    expect(chased[0]!.offsetTicks).toBe(500);
    expect(chased[0]!.remainingTicks).toBe(460);

    expect(chased[1]!.id).toBe("n2");
    expect(chased[1]!.pitchMidi).toBe(64);
    expect(chased[1]!.startTicks).toBe(480);
    expect(chased[1]!.offsetTicks).toBe(20);
    expect(chased[1]!.remainingTicks).toBe(940);

    for (const c of chased) {
      expect(ChasedMidiNoteSchema.safeParse(c).success).toBe(true);
    }
  });

  it("includes note starting exactly at seekTicks with 0 offset", () => {
    // At seekTicks = 960: n1 ends at 960 (excluded), n2 spans to 1440 (included), n3 starts at 960 (included)
    const chased = chaseMidiNotes(clips, 960);

    expect(chased.map((c) => c.id)).toEqual(["n2", "n3"]);

    const n3 = chased.find((c) => c.id === "n3")!;
    expect(n3.offsetTicks).toBe(0);
    expect(n3.remainingTicks).toBe(480);
  });

  it("excludes notes that end before or at seekTicks", () => {
    const chased = chaseMidiNotes(clips, 1500);
    expect(chased).toHaveLength(0);
  });

  it("returns empty array on empty clips or invalid ticks", () => {
    expect(chaseMidiNotes([], 500)).toEqual([]);
    expect(chaseMidiNotes(clips, Number.NaN)).toEqual([]);
  });
});
