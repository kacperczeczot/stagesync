import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  bridgeUsUgImport,
  suggestGridBpmFromUsUgTexts,
} from "./text-anchor-bridge.js";
import { importUltrastarText } from "../import/ultrastar/ultrastar-import.js";
import { secondsToTicks } from "../time-tempo/tempo-map.js";
import { DEFAULT_PPQ } from "../time-tempo/time.js";

const FIX = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "us-ug",
);

function loadPair(name: string): { us: string; ug: string } {
  return {
    us: readFileSync(join(FIX, name, "song.txt"), "utf8"),
    ug: readFileSync(join(FIX, name, "chords.txt"), "utf8"),
  };
}

describe("bridgeUsUgImport audio sync", () => {
  it("winner-intro-vc with ~120 BPM audio (content-epoch): text near tick 0, Forma follows words", () => {
    const { us, ug } = loadPair("winner-intro-vc");
    const usImport = importUltrastarText(us);
    expect(usImport.ok).toBe(true);
    if (!usImport.ok) return;

    const bpm =
      suggestGridBpmFromUsUgTexts(us, ug) ?? usImport.ultrastarMetronomeBpm;
    expect(bpm).toBeCloseTo(120, 0);
    const period = 60_000 / bpm;
    const durationMs = 180_000;
    const offsetMs = usImport.gapMs;
    const beatCount = Math.min(512, Math.ceil(durationMs / period) + 1);
    const beatMs = Array.from({ length: beatCount }, (_, i) =>
      Math.round(i * period),
    );

    const r = bridgeUsUgImport(usImport, ug, {
      idPrefix: "winner-pipe-audio",
      smartTempoAudio: {
        assetId: "a1",
        durationMs,
        peaks: [0.1, 0.5],
        audioStartOffsetMs: offsetMs,
      },
      audioAnalysis: {
        onsetsMs: beatMs,
        beatMs,
        estimatedBpm: bpm,
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const BAR = 3840;
    expect(r.seedBpm).toBeCloseTo(bpm, 0);
    const verse = r.formaMusic.clips.find((c) => c.name === "Verse")!;
    const chorus = r.formaMusic.clips.find((c) => c.name === "Chorus")!;

    const firstVocal = r.tekst.clips[0]!;
    // Content-epoch: first US note @ #GAP → near tick 0 (Beat 1)
    expect(firstVocal.startTicks).toBeLessThan(BAR);
    // Forma Verse starts on/after pickup barline near the vocal.
    expect(verse.startTicks).toBeLessThanOrEqual(BAR);
    expect(firstVocal.startTicks).toBeLessThanOrEqual(verse.startTicks);
    expect(chorus.startTicks).toBe(verse.startTicks + verse.lengthTicks);

    const winnerLine = r.tekst.clips.find((c) => /winner takes/i.test(c.text));
    expect(winnerLine).toBeTruthy();
    expect(winnerLine!.startTicks).toBeGreaterThanOrEqual(
      chorus.startTicks - BAR,
    );
  });

  it("winner-intro-vc: dynamic BPM map — Forma still follows word links", () => {
    const { us, ug } = loadPair("winner-intro-vc");
    const usImport = importUltrastarText(us);
    expect(usImport.ok).toBe(true);
    if (!usImport.ok) return;

    const durationMs = 180_000;
    const offsetMs = usImport.gapMs;
    // Mild tempo drift around 120 BPM — map must stay dynamic
    let t = 0;
    const beatMs: number[] = [0];
    for (let i = 1; i < 400 && t < durationMs; i++) {
      const period = 500 + Math.round(12 * Math.sin(i / 7));
      t += period;
      beatMs.push(t);
    }

    const r = bridgeUsUgImport(usImport, ug, {
      idPrefix: "winner-dyn",
      smartTempoAudio: {
        assetId: "a1",
        durationMs,
        peaks: [0.1, 0.5],
        audioStartOffsetMs: offsetMs,
      },
      audioAnalysis: {
        onsetsMs: beatMs,
        beatMs,
        estimatedBpm: 118,
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const BAR = 3840;
    const verse = r.formaMusic.clips.find((c) => c.name === "Verse")!;
    const chorus = r.formaMusic.clips.find((c) => c.name === "Chorus")!;

    expect(r.tempoMap.length).toBeGreaterThan(1);
    const bpms = r.tempoMap.map((e) => e.bpm);
    expect(Math.max(...bpms) - Math.min(...bpms)).toBeGreaterThan(1);

    const firstVocal = r.tekst.clips[0]!;
    expect(firstVocal.startTicks).toBeLessThan(BAR);
    expect(chorus.startTicks).toBe(verse.startTicks + verse.lengthTicks);

    // Content-epoch: Beat 1 → tick 0 on the map
    expect(
      secondsToTicks(
        0,
        r.tempoMap,
        r.seedBpm,
        { numerator: 4, denominator: 4 },
        DEFAULT_PPQ,
      ),
    ).toBe(0);
  });

  it("winner-intro-vc: Beat 1 at file start — pickup before Verse Forma", () => {
    const { us, ug } = loadPair("winner-intro-vc");
    const usImport = importUltrastarText(us);
    expect(usImport.ok).toBe(true);
    if (!usImport.ok) return;

    const durationMs = 180_000;
    const gapMs = usImport.gapMs;
    const beatMs = Array.from({ length: 360 }, (_, i) => i * 500);

    const r = bridgeUsUgImport(usImport, ug, {
      idPrefix: "winner-intro-music",
      smartTempoAudio: {
        assetId: "a1",
        durationMs,
        peaks: [0.1, 0.5],
        audioStartOffsetMs: 0,
      },
      audioAnalysis: {
        onsetsMs: beatMs,
        beatMs,
        estimatedBpm: 120,
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const BAR = 3840;
    const intro = r.formaMusic.clips.find((c) => c.name === "Intro")!;
    const verse = r.formaMusic.clips.find((c) => c.name === "Verse")!;
    const chorus = r.formaMusic.clips.find((c) => c.name === "Chorus")!;
    expect(verse.startTicks).toBe(17 * BAR);
    expect(intro.lengthTicks).toBe(verse.startTicks);
    expect(chorus.startTicks).toBe(verse.startTicks + verse.lengthTicks);

    const firstVocal = r.tekst.clips[0]!;
    const gapTicks = Math.round((gapMs / 1000) * (120 / 60) * 960);
    expect(firstVocal.startTicks).toBeGreaterThanOrEqual(gapTicks - BAR);
    expect(firstVocal.startTicks).toBeLessThanOrEqual(gapTicks + BAR);
    expect(firstVocal.startTicks).toBeLessThan(verse.startTicks);
    expect(firstVocal.startTicks).toBeGreaterThanOrEqual(
      verse.startTicks - BAR,
    );
  });

  it("winner-intro-vc: does not rewrite Audio Start Offset via chord↔syllable lock", () => {
    const { us, ug } = loadPair("winner-intro-vc");
    const usImport = importUltrastarText(us);
    expect(usImport.ok).toBe(true);
    if (!usImport.ok) return;

    const durationMs = 180_000;
    const lateOffsetMs = 2_000;
    const beatMs = Array.from(
      { length: 400 },
      (_, i) => lateOffsetMs + i * 500,
    );

    const r = bridgeUsUgImport(usImport, ug, {
      idPrefix: "winner-align",
      smartTempoAudio: {
        assetId: "a1",
        durationMs,
        peaks: [0.1, 0.5],
        audioStartOffsetMs: lateOffsetMs,
      },
      audioAnalysis: {
        onsetsMs: beatMs,
        beatMs,
        estimatedBpm: 120,
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // Text = US wall-clock; Adapt offset stays as provided (no chord lock rewrite).
    expect(r.smartTempoAudio?.audioStartOffsetMs).toBe(lateOffsetMs);

    const chorus = r.formaMusic.clips.find((c) => c.name === "Chorus")!;
    const winnerLine = r.tekst.clips.find((c) => /winner takes/i.test(c.text));
    expect(winnerLine).toBeTruthy();
    expect(winnerLine!.startTicks).toBeGreaterThanOrEqual(
      chorus.startTicks - 3840,
    );
  });

  it("Smart Tempo seed ignores UltraStar metro when audio analysis is present", () => {
    const { ug } = loadPair("winner-intro-vc");
    const usImport = importUltrastarText(
      `#TITLE:T\n#ARTIST:A\n#BPM:480\n#GAP:33000\n: 0 4 0 I \n: 5 4 0 don’t \n- 20\n: 40 4 0 The \n: 45 4 0 win \nE\n`,
    );
    expect(usImport.ok).toBe(true);
    if (!usImport.ok) return;
    const beatMs = Array.from({ length: 200 }, (_, i) => i * 500);
    const r = bridgeUsUgImport(usImport, ug, {
      smartTempoAudio: {
        assetId: "a1",
        durationMs: 100_000,
        peaks: [0.1],
        audioStartOffsetMs: 0,
      },
      audioAnalysis: {
        onsetsMs: beatMs,
        beatMs,
        estimatedBpm: 120,
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.seedBpm).toBeCloseTo(120, 0);
    expect(r.ultrastarMetronomeBpm).toBe(120);
    expect(r.formaMusic.clips.length).toBeGreaterThanOrEqual(2);
  });

  it("winner-intro-vc: manual Audio Start Offset is not overwritten by chord lock", () => {
    const { us, ug } = loadPair("winner-intro-vc");
    const usImport = importUltrastarText(us);
    expect(usImport.ok).toBe(true);
    if (!usImport.ok) return;

    const durationMs = 180_000;
    // Without the user-edit flag, lock would shift 3000 → 1000 (−1 bar @ 120).
    const manualOffsetMs = 3_000;
    const beatMs = Array.from(
      { length: 400 },
      (_, i) => manualOffsetMs + i * 500,
    );

    const r = bridgeUsUgImport(usImport, ug, {
      idPrefix: "winner-manual-offset",
      smartTempoAudio: {
        assetId: "a1",
        durationMs,
        peaks: [0.1, 0.5],
        audioStartOffsetMs: manualOffsetMs,
      },
      audioAnalysis: {
        onsetsMs: beatMs,
        beatMs,
        estimatedBpm: 120,
      },
      audioStartOffsetUserEdited: true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.smartTempoAudio?.audioStartOffsetMs).toBe(manualOffsetMs);
  });

  it("tekst keeps exact US wall-clock (no snap to audio beat grid)", () => {
    const { us, ug } = loadPair("winner-intro-vc");
    const usImport = importUltrastarText(us);
    expect(usImport.ok).toBe(true);
    if (!usImport.ok) return;

    const durationMs = 180_000;
    const offsetMs = usImport.gapMs;
    // Audio grid deliberately off US 120 BPM (500ms) so snap would skew vocals.
    const beatMs = Array.from({ length: 400 }, (_, i) => i * 480);

    const r = bridgeUsUgImport(usImport, ug, {
      idPrefix: "winner-nosnap",
      smartTempoAudio: {
        assetId: "a1",
        durationMs,
        peaks: [0.1, 0.5],
        audioStartOffsetMs: offsetMs,
      },
      audioAnalysis: {
        onsetsMs: beatMs,
        beatMs,
        estimatedBpm: 125,
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const first = r.tekst.clips[0]!;
    const blocks = first.blocks ?? [];
    expect(blocks.length).toBeGreaterThan(1);

    // First US note @ #GAP → content-epoch tick ~0 (exact ms, not nearest 480ms beat).
    expect(first.startTicks).toBeLessThan(200);

    // Second syllable: US beat spacing @ place BPM must survive (not collapse to one grid beat).
    const b0 = blocks[0]!;
    const b1 = blocks[1]!;
    expect(b1.startTicks).toBeGreaterThan(b0.startTicks);
    // At ~120 place BPM one US beat ≈ 960 ticks; allow map warp but reject snap-collapse.
    expect(b1.startTicks - b0.startTicks).toBeGreaterThan(200);
  });

  it("warns experimental when no audio", () => {
    const pair = loadPair("demo-simple");
    const us = importUltrastarText(pair.us);
    expect(us.ok).toBe(true);
    if (!us.ok) return;
    const r = bridgeUsUgImport(us, pair.ug);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.some((w) => /eksperymentalny/i.test(w))).toBe(true);
  });
});
