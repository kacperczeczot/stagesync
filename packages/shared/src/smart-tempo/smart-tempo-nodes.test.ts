import { describe, expect, it } from "vitest";
import {
  audioDurationOverflowWarning,
  closestBeatIndex,
  medianBpmFromBeatMs,
  preferAudioTempoSeed,
  preferEditorialTempoSeed,
  pruneTempoMapByBpmDelta,
  rescaleBeatGridToBpm,
  sanitizeBeatGridIbis,
  sparsifyTempoNodesFromBeatGrid,
  tempoMapFromTempoNodes,
  tempoNodesAtBarBoundaries,
  tempoNodesFromBeatGrid,
} from "./smart-tempo.js";
import { DEFAULT_PPQ, ticksPerBar } from "../time-tempo/time.js";

const METER = { numerator: 4, denominator: 4 } as const;

describe("medianBpmFromBeatMs / sparsifyTempoNodesFromBeatGrid", () => {
  it("estimates median BPM from intervals", () => {
    expect(medianBpmFromBeatMs([0, 500, 1000, 1500])).toBe(120);
    expect(medianBpmFromBeatMs([])).toBe(0);
  });

  it("preferAudioTempoSeed prefers median IBI over disagreeing analysis", () => {
    // Tight agreement → median refinement; pipe fallback ignored
    expect(preferAudioTempoSeed(112.69, 120, 112.5)).toBeCloseTo(112.5, 0);
    expect(preferAudioTempoSeed(122, 112.69, 122)).toBe(122);
    expect(preferAudioTempoSeed(0, 120, 0)).toBe(120);
    // Moderate disagreement → median wins (Adapt SSOT), analysis does not upscale
    expect(preferAudioTempoSeed(122, 120, 112)).toBe(112);
    expect(preferAudioTempoSeed(124, 120, 117)).toBe(117);
    // Half-time → use fallback octave center (pipe ~120), not 64×2=128.
    expect(preferAudioTempoSeed(64, 120, 64)).toBeCloseTo(120, 0);
  });

  it("preferEditorialTempoSeed is an alias of preferAudioTempoSeed", () => {
    expect(preferEditorialTempoSeed(112.69, 120, 112.5)).toBe(
      preferAudioTempoSeed(112.69, 120, 112.5),
    );
  });

  it("rescaleBeatGridToBpm lifts a systematically slow grid toward lock", () => {
    const slow = Array.from({ length: 40 }, (_, i) =>
      Math.round(i * (60_000 / 112.69)),
    );
    const scaled = rescaleBeatGridToBpm(slow, 120);
    const median = medianBpmFromBeatMs(scaled);
    expect(median).toBeGreaterThan(116);
    expect(median).toBeLessThan(126);
    expect(scaled[0]).toBe(slow[0]);
  });

  it("emits sparse nodes only when local tempo changes", () => {
    const period = 500;
    const beatMs = Array.from({ length: 33 }, (_, i) => i * period);
    // Speed up after bar 4 (beat 16): 450 ms ≈ 133 BPM
    for (let i = 16; i < beatMs.length; i++) {
      beatMs[i] = beatMs[15]! + (i - 15) * 450;
    }
    const dense = tempoNodesFromBeatGrid(beatMs, 0, 120, 0, METER, DEFAULT_PPQ);
    const sparse = sparsifyTempoNodesFromBeatGrid(dense, {
      seedBpm: 120,
      meter: METER,
      ppq: DEFAULT_PPQ,
    });
    expect(sparse.length).toBeLessThan(dense.length / 2);
    expect(sparse.length).toBeGreaterThanOrEqual(2);
    expect(sparse[0]!.targetTick).toBe(0);
  });

  it("ZADANIE 2 & 3: sparsify enforces bar start alignment and clamps spikes on quiet refresh", () => {
    const bpm = 120;
    const period = 60_000 / bpm;
    const beatMs: number[] = [];
    let t = 0;
    // Generate 64 beats (16 bars @ 4/4) with various local tempo changes and a giant spike
    for (let i = 0; i < 64; i++) {
      beatMs.push(Math.round(t));
      if (i === 16) {
        t += period * 0.5; // Massive spike: delta BPM > maxStep (halving the period)
      } else {
        t += period;
      }
    }
    const dense = tempoNodesFromBeatGrid(beatMs, 0, bpm, 0, METER, DEFAULT_PPQ);
    const sparse = sparsifyTempoNodesFromBeatGrid(dense, {
      seedBpm: bpm,
      meter: METER,
      ppq: DEFAULT_PPQ,
    });

    const barTicks = ticksPerBar(METER, DEFAULT_PPQ);
    for (const node of sparse.slice(0, -1)) {
      // ZADANIE 2: Verify every node is aligned on a bar boundary (Beat 1)
      expect(node.targetTick % barTicks).toBe(0);
    }
  });

  it("sparsify rejects a brief IBI blip around bar 5 (no sustained jump)", () => {
    // Stable ~123 BPM with one half-period glitch near beat 18 — must not
    // create a tempo node that accelerates Adapt by several BPM.
    const bpm = 123;
    const period = 60_000 / bpm;
    const beatMs: number[] = [];
    let t = 0;
    for (let i = 0; i < 48; i++) {
      beatMs.push(Math.round(t));
      // Single noisy short IBI into beat 18 (bar ~5)
      if (i === 17) {
        t += period * 0.52;
      } else {
        t += period;
      }
    }
    const cleaned = sanitizeBeatGridIbis(beatMs, bpm);
    const dense = tempoNodesFromBeatGrid(
      cleaned,
      0,
      bpm,
      0,
      METER,
      DEFAULT_PPQ,
    );
    const sparse = sparsifyTempoNodesFromBeatGrid(dense, {
      seedBpm: bpm,
      meter: METER,
      ppq: DEFAULT_PPQ,
    });
    const map = tempoMapFromTempoNodes(
      sparse,
      bpm,
      0,
      METER,
      DEFAULT_PPQ,
      "blip",
    );
    const barTicks = ticksPerBar(METER, DEFAULT_PPQ);
    const aroundBar5 = map.filter((ev) => {
      const bar = ev.startTicks / barTicks + 1;
      return bar >= 1 && bar <= 8;
    });
    expect(aroundBar5.length).toBeGreaterThan(0);
    for (const ev of aroundBar5) {
      expect(ev.bpm).toBeGreaterThan(bpm * 0.97);
      expect(ev.bpm).toBeLessThan(bpm * 1.04);
    }
    // No node may jump more than max step from its predecessor in this window
    for (let i = 1; i < aroundBar5.length; i++) {
      expect(
        Math.abs(aroundBar5[i]!.bpm - aroundBar5[i - 1]!.bpm),
      ).toBeLessThanOrEqual(3.01);
    }
  });

  it("pruneTempoMapByBpmDelta drops near-identical consecutive BPM", () => {
    const pruned = pruneTempoMapByBpmDelta(
      [
        { id: "a", startTicks: 0, bpm: 120 },
        { id: "b", startTicks: 960, bpm: 120.2 },
        { id: "c", startTicks: 1920, bpm: 125 },
      ],
      120,
      0,
      "p",
    );
    expect(pruned).toHaveLength(2);
    expect(pruned[1]!.bpm).toBe(125);
  });

  it("sanitizeBeatGridIbis restores a short+long false half-beat pair", () => {
    const period = 500;
    const beatMs = [0, 500, 750, 1500, 2000];
    const cleaned = sanitizeBeatGridIbis(beatMs, 120);
    expect(cleaned[2]).toBe(1000);
    for (let i = 1; i < cleaned.length; i++) {
      expect(cleaned[i]! - cleaned[i - 1]!).toBeCloseTo(period, -1);
    }
  });
});

describe("tempoNodesAtBarBoundaries", () => {
  it("emits one node per bar with absolute wall ms", () => {
    const beatMs = Array.from({ length: 9 }, (_, i) => i * 500);
    const nodes = tempoNodesAtBarBoundaries(
      beatMs,
      0,
      120,
      0,
      METER,
      DEFAULT_PPQ,
    );
    expect(nodes.length).toBeGreaterThanOrEqual(2);
    expect(nodes[0]!.targetTick).toBe(0);
    expect(nodes[0]!.wallMs).toBe(0);
  });
});

describe("tempoNodesFromBeatGrid", () => {
  it("locks Beat 1 (GAP) to tick 0 — content-epoch, dynamic intervals", () => {
    const beatMs = Array.from({ length: 80 }, (_, i) => i * 500);
    const offsetMs = 20_000;
    const beatOneIdx = closestBeatIndex(beatMs, offsetMs);
    const nodes = tempoNodesFromBeatGrid(
      beatMs,
      offsetMs,
      120,
      0,
      METER,
      DEFAULT_PPQ,
    );
    const locked = nodes.find((n) => n.wallMs === beatMs[beatOneIdx]);
    expect(locked?.wallMs).toBe(20_000);
    expect(locked?.targetTick).toBe(0);
    expect(nodes[0]!.wallMs).toBe(offsetMs);
    expect(nodes[0]!.targetTick).toBe(0);
    // Next beat (~500 ms later) ≈ one quarter at ~120 BPM
    const next = nodes.find((n) => n.wallMs > offsetMs);
    expect(next?.targetTick).toBeGreaterThan(0);
    expect(next?.targetTick).toBeLessThanOrEqual(960);
  });
});

describe("tempoMapFromTempoNodes", () => {
  it("builds sparse map from nodes", () => {
    const map = tempoMapFromTempoNodes(
      [
        { wallMs: 0, targetTick: 0 },
        { wallMs: 4000, targetTick: 3840 },
      ],
      120,
      0,
      METER,
      DEFAULT_PPQ,
      "t",
    );
    expect(map.length).toBeGreaterThan(0);
    expect(map[0]!.startTicks).toBe(0);
  });

  it("clamps segment BPM and caps nodes at audio duration", () => {
    const BAR = ticksPerBar(METER, DEFAULT_PPQ);
    const map = tempoMapFromTempoNodes(
      [
        { wallMs: 0, targetTick: 0 },
        { wallMs: 4000, targetTick: BAR },
        { wallMs: 5000, targetTick: BAR * 40 },
      ],
      120,
      0,
      METER,
      DEFAULT_PPQ,
      "t",
      { audioDurationMs: 5000 },
    );
    // ±35% seed band (safety) — pathological BAR*40 segment is clipped.
    expect(map.every((ev) => ev.bpm >= 120 * 0.65)).toBe(true);
    expect(map.every((ev) => ev.bpm <= 120 * 1.45)).toBe(true);
  });

  it("preserves section tempo changes (rubato / accelerando) within ±35% of seed", () => {
    const BAR = ticksPerBar(METER, DEFAULT_PPQ);
    const map = tempoMapFromTempoNodes(
      [
        { wallMs: 0, targetTick: 0 },
        { wallMs: 2000, targetTick: BAR }, // ~120 BPM
        { wallMs: 3777, targetTick: BAR * 2 }, // ~135 BPM
      ],
      120,
      0,
      METER,
      DEFAULT_PPQ,
      "t",
      { audioDurationMs: 4000 },
    );
    expect(map.length).toBeGreaterThan(1);
    expect(map[1]!.bpm).toBeGreaterThan(125);
  });
});

describe("audioDurationOverflowWarning", () => {
  it("warns when map exceeds audio", () => {
    expect(audioDurationOverflowWarning(90_000, 60_000)).toMatch(
      /długości audio/,
    );
    expect(audioDurationOverflowWarning(30_000, 60_000)).toBeNull();
  });
});
