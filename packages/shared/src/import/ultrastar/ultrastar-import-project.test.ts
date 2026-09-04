import { describe, expect, it } from "vitest";
import { createProjectSeed } from "../../project/project-seed.js";
import { ProjectSchema } from "../../project/schema.js";
import { DEFAULT_PPQ, elapsedToTicks } from "../../time-tempo/time.js";
import {
  applyUltrastarImportToProject,
  importUltrastarText,
  suggestGridBpmFromPipeAndFirstVocal,
  tempoMapWithImportedBpm,
  ultrastarBeatToMs,
} from "./ultrastar-import.js";

const METER = { numerator: 4, denominator: 4 } as const;

describe("applyUltrastarImportToProject", () => {
  it("replaces tekst and melody; leaves Forma unchanged", () => {
    const imported = importUltrastarText(`#TITLE:Imported
#ARTIST:Band
#BPM:400
#GAP:0
: 0 4 0 Hi 
-
: 8 4 0 There 
E
`);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;

    const base = createProjectSeed("p1", "Old", "2026-08-02T12:00:00.000Z");
    const next = applyUltrastarImportToProject(base, imported);
    expect(next.name).toBe("Imported");
    expect(next.artist).toBe("Band");
    expect(next.defaultBpm).toBe(120);
    expect(next.tempoMap[0]!.bpm).toBe(120);
    expect(next.tekst.clips).toHaveLength(2);
    expect(next.melody.clips).toHaveLength(2);
    expect(next.akordy.clips).toEqual(base.akordy.clips);
    expect(next.forma.clips).toEqual(base.forma.clips);
    expect(ProjectSchema.parse(next).formatVersion).toBe(6);
  });

  it("leaves existing project tempoMap unchanged (UltraStar #BPM is decode-only)", () => {
    const imported = importUltrastarText(`#TITLE:Africa
#BPM:369.2
#GAP:23300
: 0 4 0 Hi 
E
`);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;

    const base = createProjectSeed("p1", "Old", "2026-08-02T12:00:00.000Z");
    expect(base.tempoMap[0]!.bpm).toBe(120);
    const next = applyUltrastarImportToProject(base, imported);
    expect(next.defaultBpm).toBe(120);
    expect(next.tempoMap).toHaveLength(1);
    expect(next.tempoMap[0]!.startTicks).toBe(0);
    expect(next.tempoMap[0]!.bpm).toBe(120);
    expect(next.tekst.clips.length).toBeGreaterThan(0);
  });
});

describe("wall-clock + editorial grid BPM", () => {
  it("ultrastarBeatToMs matches USDX formula", () => {
    expect(ultrastarBeatToMs(0, 33000, 339.36)).toBe(33000);
    // beat 16 @ header 480 → 16 × 60000 / (480×4) = 500 ms after GAP
    expect(ultrastarBeatToMs(16, 0, 480)).toBe(500);
  });

  it("suggestGridBpmFromPipeAndFirstVocal locks pipe + pickup to first vocal", () => {
    // 16 bars + 0.5 pickup @ 33s → 120 BPM (Beat 1 at file 0)
    expect(
      suggestGridBpmFromPipeAndFirstVocal({
        pipeBarCount: 16,
        firstVocalMs: 33000,
      }),
    ).toBe(120);
    expect(
      suggestGridBpmFromPipeAndFirstVocal({
        pipeBarCount: 0,
        firstVocalMs: 33000,
      }),
    ).toBeNull();
  });

  it("suggestGridBpmFromPipeAndFirstVocal is content-relative to Beat 1", () => {
    // SingStar-style GAP 35140 with Beat 1 @ 2140 → same 16.5 bars @ 120
    expect(
      suggestGridBpmFromPipeAndFirstVocal({
        pipeBarCount: 16,
        firstVocalMs: 35140,
        beat1Ms: 2140,
      }),
    ).toBe(120);
    // Absolute GAP without Beat 1 underestimates (~113) — callers must pass beat1
    expect(
      suggestGridBpmFromPipeAndFirstVocal({
        pipeBarCount: 16,
        firstVocalMs: 35140,
        beat1Ms: 0,
      }),
    ).toBeCloseTo(112.69, 1);
    // trimIn ~3014 → ~123 (Logic Adapt band)
    expect(
      suggestGridBpmFromPipeAndFirstVocal({
        pipeBarCount: 16,
        firstVocalMs: 35140,
        beat1Ms: 3014,
      }),
    ).toBeCloseTo(123.3, 0);
  });

  it("gridBpm override keeps wall-clock onsets (no beat-lock drift)", () => {
    const src = `#TITLE:Grid
#BPM:339.36
#GAP:33000
: 0 4 0 Hi 
: 16 4 0 Yo 
E
`;
    const file = importUltrastarText(src);
    const grid = importUltrastarText(src, { gridBpm: 120 });
    expect(file.ok && grid.ok).toBe(true);
    if (!file.ok || !grid.ok) return;
    expect(file.metronomeBpm).toBeCloseTo(84.84, 1);
    expect(grid.metronomeBpm).toBe(120);
    expect(grid.tekst.clips[0]!.startTicks).toBe(
      elapsedToTicks(33000, 120, METER, DEFAULT_PPQ),
    );
    // Second note: same wall-clock at both BPMs when converted back
    const yoMs = ultrastarBeatToMs(16, 33000, 339.36);
    expect(grid.melody.clips[1]!.startTicks).toBe(
      elapsedToTicks(yoMs, 120, METER, DEFAULT_PPQ),
    );
    expect(file.melody.clips[1]!.startTicks).toBe(
      elapsedToTicks(yoMs, file.metronomeBpm, METER, DEFAULT_PPQ),
    );
  });

  describe("tempoMapWithImportedBpm", () => {
    it("updates existing tempo event at tick 0 in place", () => {
      const map = [
        { id: "t0", startTicks: 0, bpm: 120 },
        { id: "t1", startTicks: 3840, bpm: 140 },
      ];
      const result = tempoMapWithImportedBpm(map, 130);
      expect(result).toEqual([
        { id: "t0", startTicks: 0, bpm: 130 },
        { id: "t1", startTicks: 3840, bpm: 140 },
      ]);
    });

    it("creates a new tick 0 tempo event if map is empty", () => {
      const result = tempoMapWithImportedBpm([], 125);
      expect(result).toEqual([{ id: "us-tempo-0", startTicks: 0, bpm: 125 }]);
    });

    it("prepends tick 0 tempo event if map has events starting after 0", () => {
      const map = [{ id: "t1", startTicks: 3840, bpm: 140 }];
      const result = tempoMapWithImportedBpm(map, 115);
      expect(result).toEqual([
        { id: "us-tempo-0", startTicks: 0, bpm: 115 },
        { id: "t1", startTicks: 3840, bpm: 140 },
      ]);
    });
  });

  describe("applyUltrastarImportToProject", () => {
    it("merges title, artist, tekst, melody, and BPM updates into project", () => {
      const seed = createProjectSeed(
        "test-p",
        "Song",
        "2026-07-20T12:00:00.000Z",
      );
      const imported = importUltrastarText(
        `#TITLE:My Song\n#ARTIST:My Band\n#BPM:480\n#GAP:1000\n: 0 4 0 La\nE`,
      );
      expect(imported.ok).toBe(true);
      if (!imported.ok) return;

      const updated = applyUltrastarImportToProject(seed, imported, {
        applyBpm: true,
      });
      expect(updated.name).toBe("My Song");
      expect(updated.artist).toBe("My Band");
      expect(updated.defaultBpm).toBe(120);
      expect(updated.tempoMap[0]!.bpm).toBe(120);
      expect(updated.tekst.clips.length).toBeGreaterThan(0);
      expect(updated.melody.clips.length).toBeGreaterThan(0);
    });

    it("preserves project name and artist if imported fields are empty or whitespace", () => {
      const seed = {
        ...createProjectSeed("test-p", "Song", "2026-07-20T12:00:00.000Z"),
        name: "Original Title",
        artist: "Original Artist",
      };
      const imported = importUltrastarText(
        `#BPM:480\n#GAP:1000\n: 0 4 0 La\nE`,
      );
      expect(imported.ok).toBe(true);
      if (!imported.ok) return;

      const updated = applyUltrastarImportToProject(seed, imported, {
        applyBpm: false,
      });
      expect(updated.name).toBe("Original Title");
      expect(updated.artist).toBe("Original Artist");
      expect(updated.defaultBpm).toBe(seed.defaultBpm);
    });
  });
});
