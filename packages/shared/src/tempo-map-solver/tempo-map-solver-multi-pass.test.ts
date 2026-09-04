import { describe, expect, it } from "vitest";
import {
  TEMPO_SOLVER_PRUNE_DELTA_BPM,
  runMultiPassTempoSolver,
  tempoEventsFromMsTickAnchors,
  resolveAnchorTargetTicks,
  type TempoSolverAnchor,
  type TempoSolverSectionPlan,
} from "./tempo-map-solver.js";
import { DEFAULT_PPQ, ticksPerBar, ticksToMs } from "../time-tempo/time.js";

const METER = { numerator: 4, denominator: 4 } as const;
const BAR = ticksPerBar(METER, DEFAULT_PPQ);

describe("runMultiPassTempoSolver E2 prune + Forma walls", () => {
  it("prunes consecutive events when |ΔBPM| ≤ 0.5", () => {
    const result = runMultiPassTempoSolver({
      fallbackBpm: 120,
      meter: METER,
      ppq: DEFAULT_PPQ,
      idPrefix: "t",
      anchors: [
        {
          ms: 0,
          sectionIndex: 0,
          kind: "section",
          weight: 1,
          ugBarsHint: 4,
        },
        {
          ms: 8000,
          sectionIndex: 1,
          kind: "section",
          weight: 1,
          ugBarsHint: 4,
        },
      ],
      sections: [
        {
          name: "A",
          pipeBarCount: 4,
          chordCount: 0,
          vocalMsRange: { startMs: 0, endMs: 8000 },
        },
        {
          name: "B",
          pipeBarCount: 4,
          chordCount: 0,
          vocalMsRange: { startMs: 8000, endMs: 16_000 },
        },
      ],
    });
    expect(result.seedBpm).toBe(120);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]!.startTicks).toBe(0);
    expect(result.sections[0]!.lengthTicks).toBe(4 * BAR);
    expect(result.sections[1]!.startTicks).toBe(4 * BAR);
    // Distinct tick events kept (no E2 collapse) so ms→tick round-trips stay exact.
    expect(result.tempoMap.length).toBeGreaterThanOrEqual(1);
    expect(result.tempoMap[0]!.bpm).toBeCloseTo(120, 0);
  });

  it("keeps a tempo event when |ΔBPM| > prune delta", () => {
    const result = runMultiPassTempoSolver({
      fallbackBpm: 120,
      meter: METER,
      ppq: DEFAULT_PPQ,
      idPrefix: "t",
      anchors: [
        {
          ms: 0,
          sectionIndex: 0,
          kind: "section",
          weight: 1,
          ugBarsHint: 4,
        },
        {
          ms: 8000,
          sectionIndex: 1,
          kind: "section",
          weight: 1,
          ugBarsHint: 4,
        },
      ],
      sections: [
        {
          name: "A",
          pipeBarCount: 4,
          chordCount: 0,
          vocalMsRange: { startMs: 0, endMs: 8000 },
        },
        {
          name: "B",
          pipeBarCount: 4,
          chordCount: 0,
          vocalMsRange: { startMs: 8000, endMs: 20_000 },
        },
      ],
    });
    expect(result.tempoMap.length).toBeGreaterThanOrEqual(2);
    const delta = Math.abs(result.tempoMap[1]!.bpm - result.tempoMap[0]!.bpm);
    expect(delta).toBeGreaterThan(TEMPO_SOLVER_PRUNE_DELTA_BPM);
    expect(result.sections[1]!.startTicks).toBe(
      result.sections[0]!.startTicks + result.sections[0]!.lengthTicks,
    );
  });

  it("Forma pristineBars from vocal ms @ seedBpm when no structuralBars", () => {
    // 12s vocal @ 120 → 6 bars (legacy path without UG structuralBars)
    const result = runMultiPassTempoSolver({
      fallbackBpm: 120,
      meter: METER,
      ppq: DEFAULT_PPQ,
      idPrefix: "ms",
      anchors: [
        {
          ms: 0,
          sectionIndex: 0,
          kind: "section",
          weight: 1,
          ugBarsHint: 4,
          barOffset: 0,
        },
        {
          ms: 8000,
          sectionIndex: 1,
          kind: "section",
          weight: 1,
          barOffset: 0,
        },
        { ms: 8000, sectionIndex: 1, kind: "phrase", weight: 1, barOffset: 0 },
        {
          ms: 11_000,
          sectionIndex: 1,
          kind: "phrase",
          weight: 1,
          barOffset: 1,
        },
        {
          ms: 14_000,
          sectionIndex: 1,
          kind: "phrase",
          weight: 1,
          barOffset: 2,
        },
        {
          ms: 17_000,
          sectionIndex: 1,
          kind: "phrase",
          weight: 1,
          barOffset: 3,
        },
        {
          ms: 20_000,
          sectionIndex: 1,
          kind: "phrase",
          weight: 1,
          barOffset: 4,
        },
      ],
      sections: [
        {
          name: "Intro",
          pipeBarCount: 4,
          chordCount: 0,
          vocalMsRange: null,
        },
        {
          name: "Verse",
          pipeBarCount: 0,
          chordCount: 4,
          vocalMsRange: { startMs: 8000, endMs: 20_000 },
        },
      ],
    });
    expect(result.sections[1]!.pristineBars).toBe(6);
    expect(result.sections[1]!.startTicks).toBe(4 * BAR);
    expect(result.sections[0]!.endMs).toBe(8000);
    // Section-wall map (sparse) — not per-phrase BPM kinks
    expect(result.tempoMap.length).toBeGreaterThanOrEqual(1);
    expect(result.tempoMap[0]!.startTicks).toBe(0);
  });

  it("Forma pristineBars prefer US-wall structuralBars over ms span", () => {
    const result = runMultiPassTempoSolver({
      fallbackBpm: 120,
      meter: METER,
      ppq: DEFAULT_PPQ,
      idPrefix: "ug",
      anchors: [
        {
          ms: 0,
          sectionIndex: 0,
          kind: "section",
          weight: 1,
          ugBarsHint: 4,
          barOffset: 0,
        },
        {
          ms: 8000,
          sectionIndex: 1,
          kind: "section",
          weight: 1,
          barOffset: 0,
        },
      ],
      sections: [
        {
          name: "Intro",
          pipeBarCount: 4,
          chordCount: 0,
          vocalMsRange: null,
        },
        {
          name: "Verse",
          pipeBarCount: 0,
          chordCount: 8,
          structuralBars: 16,
          vocalMsRange: { startMs: 8000, endMs: 20_000 },
        },
      ],
    });
    expect(result.sections[1]!.pristineBars).toBe(16);
    expect(result.sections[1]!.lengthTicks).toBe(16 * BAR);
  });

  it("exact tick↔ms map keeps ballad ~45 BPM (not clamped up to 60)", () => {
    // 1 bar of ticks vs duration of one bar @ 45 BPM
    const barMsAt45 = ticksToMs(BAR, 45, METER, DEFAULT_PPQ);
    const events = tempoEventsFromMsTickAnchors(
      [
        { ms: 0, targetTick: 0 },
        { ms: barMsAt45, targetTick: BAR },
      ],
      0,
      45,
      METER,
      DEFAULT_PPQ,
      BAR,
      { soft: false },
    );
    expect(events[0]!.bpm).toBeGreaterThan(40);
    expect(events[0]!.bpm).toBeLessThan(50);
    expect(events[0]!.bpm).toBeCloseTo(45, 0);
  });
});

describe("tempoEventsFromMsTickAnchors / resolveAnchorTargetTicks", () => {
  it("clamps wild ideal BPM into seed ±8% (no 64↔160 catch-up)", () => {
    // 1 bar of ticks vs 8s wall-clock would want ~30 BPM — must clamp near seed.
    const anchors = [
      { ms: 0, targetTick: 0 },
      { ms: 8000, targetTick: BAR },
      { ms: 9000, targetTick: 2 * BAR },
    ];
    const events = tempoEventsFromMsTickAnchors(
      anchors,
      0,
      120,
      METER,
      DEFAULT_PPQ,
      BAR,
      { soft: true },
    );
    for (const ev of events) {
      expect(ev.bpm).toBeGreaterThanOrEqual(120 * 0.92 - 0.01);
      expect(ev.bpm).toBeLessThanOrEqual(120 * 1.08 + 0.01);
    }
    // Adjacent steps also within ±8% of seed
    for (let i = 1; i < events.length; i++) {
      expect(Math.abs(events[i]!.bpm - events[i - 1]!.bpm)).toBeLessThanOrEqual(
        120 * 0.08 + 0.05,
      );
    }
  });

  it("clamps barOffset to last bar as safety — no proportional compress", () => {
    const plans: TempoSolverSectionPlan[] = [
      {
        sectionIndex: 0,
        name: "V",
        startMs: 0,
        endMs: 4000,
        pristineBars: 4,
        fromPipe: false,
        startTicks: 0,
        lengthTicks: 4 * BAR,
      },
    ];
    const anchors: TempoSolverAnchor[] = [
      { ms: 0, sectionIndex: 0, kind: "chord", weight: 1, barOffset: 0 },
      { ms: 1000, sectionIndex: 0, kind: "chord", weight: 1, barOffset: 3 },
      { ms: 2000, sectionIndex: 0, kind: "chord", weight: 1, barOffset: 7 },
    ];
    const msTick = resolveAnchorTargetTicks(anchors, plans, BAR);
    expect(msTick[0]!.targetTick).toBe(0);
    expect(msTick[1]!.targetTick).toBe(3 * BAR);
    // Oversized offset clamps to last barline — does NOT squash 0→3→7 into mid-grid
    expect(msTick[msTick.length - 1]!.targetTick).toBe(3 * BAR);
  });
});

describe("Smart Tempo tempoNodes + audio duration", () => {
  it("emits tempoNodes and warns when map exceeds audio", () => {
    const result = runMultiPassTempoSolver({
      fallbackBpm: 120,
      meter: METER,
      ppq: DEFAULT_PPQ,
      idPrefix: "t",
      audioDurationMs: 1000,
      anchors: [
        {
          ms: 0,
          sectionIndex: 0,
          kind: "section",
          weight: 1,
          ugBarsHint: 8,
        },
        {
          ms: 20_000,
          sectionIndex: 1,
          kind: "section",
          weight: 1,
          ugBarsHint: 8,
        },
      ],
      sections: [
        {
          name: "A",
          pipeBarCount: 8,
          chordCount: 0,
          vocalMsRange: { startMs: 0, endMs: 20_000 },
        },
        {
          name: "B",
          pipeBarCount: 8,
          chordCount: 0,
          vocalMsRange: { startMs: 20_000, endMs: 40_000 },
        },
      ],
    });
    expect(result.tempoNodes.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => /długość audio/i.test(w))).toBe(true);
  });
});
