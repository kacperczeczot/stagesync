import { describe, expect, it } from "vitest";
import {
  alignBeat1ToChordSyllable,
  extendBeatGridToDuration,
  layoutFormaFromAlignedWords,
  layoutFormaFromUgBarCounts,
  msPerBarAtBpm,
  snapBeat1MsToOnset,
  suggestBeat1MsFromPipeAndGap,
} from "./smart-tempo.js";
import { DEFAULT_PPQ, ticksPerBar } from "../time-tempo/time.js";

const METER = { numerator: 4, denominator: 4 } as const;
const BAR = ticksPerBar(METER, DEFAULT_PPQ);

describe("extendBeatGridToDuration", () => {
  it("continues constant spacing through full duration", () => {
    const partial = [0, 500, 1000];
    const extended = extendBeatGridToDuration(partial, 10_000, 120);
    expect(extended.length).toBeGreaterThan(3);
    expect(extended[extended.length - 1]!).toBeGreaterThan(9_000);
  });
});

describe("suggestBeat1MsFromPipeAndGap", () => {
  it("places GAP at pipe+½ bars for long intros (Winner-like)", () => {
    expect(
      suggestBeat1MsFromPipeAndGap({
        gapMs: 33_000,
        pipeBarCount: 16,
        layoutBpm: 120,
      }),
    ).toBe(0);
  });

  it("keeps a transient within ±½ bar of the ideal Beat 1", () => {
    expect(
      suggestBeat1MsFromPipeAndGap({
        gapMs: 33_000,
        pipeBarCount: 16,
        layoutBpm: 120,
        transientMs: 400,
      }),
    ).toBe(400);
  });

  it("ignores a late transient far from ideal (avoids −1 bar vocal drift)", () => {
    expect(
      suggestBeat1MsFromPipeAndGap({
        gapMs: 33_000,
        pipeBarCount: 16,
        layoutBpm: 120,
        transientMs: 2_000,
      }),
    ).toBe(0);
    expect(
      suggestBeat1MsFromPipeAndGap({
        gapMs: 33_000,
        pipeBarCount: 16,
        layoutBpm: 120,
        transientMs: 1_000,
      }),
    ).toBe(0);
  });

  it("falls back to GAP when quiet until vocal (short/no pipe)", () => {
    expect(
      suggestBeat1MsFromPipeAndGap({
        gapMs: 12_500,
        pipeBarCount: 0,
        layoutBpm: 120,
        transientMs: 12_000,
      }),
    ).toBe(12_500);
  });
});

describe("snapBeat1MsToOnset", () => {
  it("snaps to the nearest onset within ±¼ beat (prefers closer over farther-earlier)", () => {
    // 120 BPM → ¼ beat = 125 ms; 3010 is closer than 2900
    expect(snapBeat1MsToOnset(3000, [2900, 3010, 3200], 120)).toBe(3010);
  });

  it("pulls Beat 1 earlier when that onset is the nearest in-window hit", () => {
    expect(snapBeat1MsToOnset(3000, [2950, 3200], 120)).toBe(2950);
  });

  it("snaps later when the nearest onset is after editorial", () => {
    // Editorial past the attack → snap forward onto the onset (not leave MP3 early).
    expect(snapBeat1MsToOnset(3000, [3050, 3400], 120)).toBe(3050);
  });

  it("no-ops when onsets are far from editorial", () => {
    expect(snapBeat1MsToOnset(3000, [1000, 5000], 120)).toBe(3000);
  });
});

describe("alignBeat1ToChordSyllable", () => {
  it("nudges Beat 1 earlier when first chord syllable is ~1 bar early", () => {
    const BAR_MS = msPerBarAtBpm(120, METER, DEFAULT_PPQ);
    const verseStart = 17 * BAR;
    // Beat 1 @ 2000ms, GAP/chord @ 33000 → content = 15.5 bars (1 bar early vs pickup)
    const aligned = alignBeat1ToChordSyllable({
      audioStartOffsetMs: 2_000,
      chordSyllableMs: 33_000,
      formaSectionStartTicks: verseStart,
      pipeBarCount: 16,
      seedBpm: 120,
      meter: METER,
      ppq: DEFAULT_PPQ,
    });
    expect(aligned).toBe(0);
    expect(Math.abs(aligned - (33_000 - 16.5 * BAR_MS))).toBeLessThan(
      BAR_MS * 0.25,
    );
  });

  it("leaves GAP-as-Beat1 alone (intentional intro trim)", () => {
    expect(
      alignBeat1ToChordSyllable({
        audioStartOffsetMs: 33_000,
        chordSyllableMs: 33_000,
        formaSectionStartTicks: 17 * BAR,
        pipeBarCount: 16,
        seedBpm: 120,
      }),
    ).toBe(33_000);
  });

  it("no-ops when already aligned", () => {
    expect(
      alignBeat1ToChordSyllable({
        audioStartOffsetMs: 0,
        chordSyllableMs: 33_000,
        formaSectionStartTicks: 17 * BAR,
        pipeBarCount: 16,
        seedBpm: 120,
      }),
    ).toBe(0);
  });

  it("shifts a manual 3000ms Beat 1 by −1 bar @ 120 (would fight UI without override)", () => {
    const BAR_MS = msPerBarAtBpm(120, METER, DEFAULT_PPQ);
    expect(
      alignBeat1ToChordSyllable({
        audioStartOffsetMs: 3_000,
        chordSyllableMs: 33_000,
        formaSectionStartTicks: 17 * BAR,
        pipeBarCount: 16,
        seedBpm: 120,
      }),
    ).toBe(3_000 - BAR_MS);
  });
});

describe("layoutFormaFromUgBarCounts", () => {
  it("sizes sections from UG pipe / structural bars only", () => {
    const plans = layoutFormaFromUgBarCounts(
      [
        {
          name: "Intro",
          pipeBarCount: 4,
          chordCount: 0,
          structuralBars: 1,
          vocalAnchored: false,
        },
        {
          name: "Verse",
          pipeBarCount: 0,
          chordCount: 4,
          structuralBars: 6,
          vocalAnchored: true,
        },
      ],
      0,
      METER,
      DEFAULT_PPQ,
    );
    expect(plans[0]!.pristineBars).toBe(4);
    expect(plans[1]!.pristineBars).toBe(6);
    expect(plans[1]!.startTicks).toBe(4 * BAR);
  });
});

describe("layoutFormaFromAlignedWords", () => {
  it("places vocal Beat 1 from firstWordTicks and keeps integer bars", () => {
    const plans = layoutFormaFromAlignedWords(
      [
        {
          name: "Intro",
          pipeBarCount: 2,
          firstWordTicks: null,
          lastWordTicks: null,
        },
        {
          name: "Verse",
          pipeBarCount: 0,
          firstWordTicks: 2 * BAR + 100,
          lastWordTicks: 5 * BAR,
        },
      ],
      0,
      METER,
      DEFAULT_PPQ,
    );
    expect(plans[0]!.startTicks).toBe(0);
    expect(plans[1]!.startTicks).toBe(2 * BAR);
    expect(plans[1]!.lengthTicks % BAR).toBe(0);
    expect(plans[1]!.pristineBars).toBeGreaterThanOrEqual(3);
  });

  it("wordless pipe with next vocal already behind cursor keeps 1-bar stub (not full pipeBars)", () => {
    const plans = layoutFormaFromAlignedWords(
      [
        {
          name: "Verse",
          pipeBarCount: 0,
          firstWordTicks: 0,
          lastWordTicks: BAR,
        },
        {
          name: "Solo",
          pipeBarCount: 4,
          firstWordTicks: null,
          lastWordTicks: null,
        },
        {
          name: "Chorus",
          pipeBarCount: 0,
          // Chorus Beat 1 already behind Solo cursor after Verse ends
          firstWordTicks: BAR / 2,
          lastWordTicks: 3 * BAR,
        },
      ],
      0,
      METER,
      DEFAULT_PPQ,
    );
    expect(plans).toHaveLength(3);
    expect(plans.map((p) => p.name)).toEqual(["Verse", "Solo", "Chorus"]);
    // Coverage stub — not authored 4 bars (that would shove Chorus).
    expect(plans[1]!.pristineBars).toBe(1);
    expect(plans[1]!.lengthTicks).toBe(BAR);
    for (const p of plans) {
      expect(p.lengthTicks).toBeGreaterThan(0);
      expect(p.lengthTicks % BAR).toBe(0);
    }
    expect(plans[1]!.startTicks).toBe(
      plans[0]!.startTicks + plans[0]!.lengthTicks,
    );
    expect(plans[2]!.startTicks).toBe(
      plans[1]!.startTicks + plans[1]!.lengthTicks,
    );
  });
});
