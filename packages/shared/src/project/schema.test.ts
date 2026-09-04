import { describe, expect, it } from "vitest";
import {
  CueSampleConfigSchema,
  ProjectSchema,
  ProjectSchemaV2,
  ProjectSchemaV3,
  ProjectSchemaV4,
  ProjectSchemaV5,
  ProjectSchemaV6,
} from "./schema.js";
import {
  createProjectV2Seed,
  createProjectV3Seed,
  createProjectV4Seed,
  createProjectV5Seed,
  createProjectV6Seed,
  upgradeProjectV2ToV3,
  upgradeProjectV3ToV4,
  upgradeProjectV4ToV5,
  upgradeProjectV5ToV6,
} from "./project-seed.js";

describe("ProjectSchemaV3", () => {
  it("parses a v3 project seed", () => {
    const raw = createProjectV3Seed("abc", "Song", "2026-07-19T12:00:00.000Z");
    expect(ProjectSchemaV3.parse(raw)).toEqual(raw);
    expect(raw.formatVersion).toBe(3);
  });

  it("upgrades v2 to v3", () => {
    const v2 = createProjectV2Seed("abc", "Song", "2026-07-19T12:00:00.000Z");
    expect(ProjectSchemaV2.parse(v2).formatVersion).toBe(2);
    const v3 = upgradeProjectV2ToV3(v2);
    expect(ProjectSchemaV3.parse(v3).audioTracks).toEqual([]);
  });
});

describe("ProjectSchemaV4", () => {
  it("parses a v4 project seed", () => {
    const raw = createProjectV4Seed("abc", "Song", "2026-07-19T12:00:00.000Z");
    expect(ProjectSchemaV4.parse(raw)).toEqual(raw);
    expect(raw.formatVersion).toBe(4);
  });

  it("upgrades v3 to v4", () => {
    const v3 = createProjectV3Seed("abc", "Song", "2026-07-19T12:00:00.000Z");
    const v4 = upgradeProjectV3ToV4(v3);
    expect(ProjectSchemaV4.parse(v4).tekst.clips).toEqual([]);
  });
});

describe("ProjectSchemaV5", () => {
  it("parses a v5 project seed", () => {
    const raw = createProjectV5Seed("abc", "Song", "2026-07-19T12:00:00.000Z");
    expect(ProjectSchemaV5.parse(raw)).toEqual(raw);
    expect(raw.formatVersion).toBe(5);
    expect(raw.keyMap.length).toBeGreaterThan(0);
    expect(raw.midiProgramId).toBe(0);
  });

  it("rejects unknown keys (strict)", () => {
    const raw = {
      ...createProjectV5Seed("abc", "Song", "2026-07-19T12:00:00.000Z"),
      legacyField: true,
    };
    expect(() => ProjectSchemaV5.parse(raw)).toThrow();
  });

  it("rejects empty name", () => {
    expect(() =>
      ProjectSchemaV5.parse({
        ...createProjectV5Seed("abc", "X", "2026-07-19T12:00:00.000Z"),
        name: "",
      }),
    ).toThrow();
  });

  it("upgrades v4 to v5", () => {
    const v4 = createProjectV4Seed("abc", "Song", "2026-07-19T12:00:00.000Z");
    const v5 = upgradeProjectV4ToV5(v4);
    expect(ProjectSchemaV5.parse(v5).keyMap[0]?.key.tonic).toBe("C");
  });

  it("accepts Cue sample config and rejects stale sample bus / asset", () => {
    expect(
      CueSampleConfigSchema.parse({
        assetId: "a1",
        mode: "gated",
        quantization: "next-beat",
        output: { kind: "bus", busId: "bus-a" },
        playPostStop: true,
      }).mode,
    ).toBe("gated");

    const seed = createProjectV5Seed("abc", "Song", "2026-07-19T12:00:00.000Z");
    const withAsset = {
      ...seed,
      assets: [
        {
          id: "a1",
          storageName: "hit.wav",
          originalName: "hit.wav",
          kind: "audio" as const,
          mimeType: "audio/wav",
          sizeBytes: 100,
        },
      ],
      audioBusses: [{ id: "bus-a", name: "Bus A" }],
      cue: {
        clips: [
          {
            id: "c1",
            startTicks: 0,
            lengthTicks: 960,
            label: "Hit",
            sample: {
              assetId: "a1",
              mode: "one-shot" as const,
              output: { kind: "bus" as const, busId: "bus-a" },
            },
          },
        ],
      },
    };
    expect(ProjectSchemaV5.parse(withAsset).cue.clips[0]?.sample?.assetId).toBe(
      "a1",
    );

    expect(() =>
      ProjectSchemaV5.parse({
        ...withAsset,
        cue: {
          clips: [
            {
              id: "c1",
              startTicks: 0,
              lengthTicks: 960,
              label: "Hit",
              sample: { assetId: "missing" },
            },
          ],
        },
      }),
    ).toThrow(/audio asset/i);

    expect(() =>
      ProjectSchemaV5.parse({
        ...withAsset,
        cue: {
          clips: [
            {
              id: "c1",
              startTicks: 0,
              lengthTicks: 960,
              label: "Hit",
              sample: {
                assetId: "a1",
                output: { kind: "bus", busId: "gone" },
              },
            },
          ],
        },
      }),
    ).toThrow(/busId/i);
  });

  it("rejects template with midiProgramId", () => {
    expect(() =>
      ProjectSchemaV5.parse({
        ...createProjectV5Seed("abc", "Tpl", "2026-07-19T12:00:00.000Z", {
          isTemplate: true,
        }),
        midiProgramId: 1,
      }),
    ).toThrow();
  });

  it("rejects artist longer than 200 chars", () => {
    const seed = createProjectV5Seed("abc", "Song", "2026-07-19T12:00:00.000Z");
    expect(() =>
      ProjectSchemaV5.parse({
        ...seed,
        artist: "x".repeat(201),
      }),
    ).toThrow();
  });
});

describe("ProjectSchemaV6", () => {
  it("parses a v6 project seed", () => {
    const raw = createProjectV6Seed("abc", "Song", "2026-07-19T12:00:00.000Z");
    expect(ProjectSchema.parse(raw)).toEqual(raw);
    expect(raw.formatVersion).toBe(6);
    expect(raw.melody).toEqual({ clips: [] });
    expect(raw.tekst.clips).toEqual([]);
    expect(raw.keyMap.length).toBeGreaterThan(0);
    expect(raw.midiProgramId).toBe(0);
  });

  it("rejects tekst clip without blocks", () => {
    const seed = createProjectV6Seed("abc", "Song", "2026-07-19T12:00:00.000Z");
    expect(() =>
      ProjectSchema.parse({
        ...seed,
        tekst: {
          clips: [
            {
              id: "t1",
              startTicks: 0,
              lengthTicks: 960,
              text: "Hello",
            },
          ],
        },
      }),
    ).toThrow();
  });

  it("rejects empty blocks array", () => {
    const seed = createProjectV6Seed("abc", "Song", "2026-07-19T12:00:00.000Z");
    expect(() =>
      ProjectSchema.parse({
        ...seed,
        tekst: {
          clips: [
            {
              id: "t1",
              startTicks: 0,
              lengthTicks: 960,
              text: "Hello",
              blocks: [],
            },
          ],
        },
      }),
    ).toThrow();
  });

  it("accepts multi-block line and optional role / melody note", () => {
    const seed = createProjectV6Seed("abc", "Song", "2026-07-19T12:00:00.000Z");
    const raw = {
      ...seed,
      tekst: {
        clips: [
          {
            id: "t1",
            startTicks: 0,
            lengthTicks: 1920,
            text: "Hello world",
            blocks: [
              {
                id: "b1",
                startTicks: 0,
                lengthTicks: 960,
                text: "Hello",
                role: "vocal_1" as const,
              },
              {
                id: "b2",
                startTicks: 960,
                lengthTicks: 960,
                text: "world",
              },
            ],
          },
        ],
      },
      melody: {
        clips: [
          {
            id: "m1",
            startTicks: 0,
            lengthTicks: 480,
            pitchMidi: 60,
          },
        ],
      },
    };
    const parsed = ProjectSchema.parse(raw);
    expect(parsed.tekst.clips[0]?.blocks).toHaveLength(2);
    expect(parsed.tekst.clips[0]?.blocks[0]?.role).toBe("vocal_1");
    expect(parsed.melody.clips[0]?.pitchMidi).toBe(60);
  });

  it("rejects melody pitchMidi out of range", () => {
    const seed = createProjectV6Seed("abc", "Song", "2026-07-19T12:00:00.000Z");
    expect(() =>
      ProjectSchema.parse({
        ...seed,
        melody: {
          clips: [
            { id: "m1", startTicks: 0, lengthTicks: 480, pitchMidi: 128 },
          ],
        },
      }),
    ).toThrow();
  });

  it("upgrades v5 to v6 with one whole-line block; preserves lanes", () => {
    const v5 = {
      ...createProjectV5Seed("abc", "Song", "2026-07-19T12:00:00.000Z"),
      tekst: {
        clips: [
          {
            id: "line-1",
            startTicks: 100,
            lengthTicks: 2000,
            text: "Whole line",
            sourceSection: "Verse",
          },
        ],
      },
      akordy: {
        clips: [
          {
            id: "a1",
            startTicks: 100,
            lengthTicks: 960,
            symbol: "Am",
          },
        ],
      },
      assets: [
        {
          id: "audio-1",
          storageName: "x.wav",
          originalName: "x.wav",
          kind: "audio" as const,
          mimeType: "audio/wav",
          sizeBytes: 10,
        },
      ],
      audioTracks: [{ id: "tr-1", name: "Stem" }],
      audioClips: [
        {
          id: "ac-1",
          trackId: "tr-1",
          assetId: "audio-1",
          startTicks: 0,
          lengthTicks: 3840,
        },
      ],
    };
    expect(ProjectSchemaV5.parse(v5).formatVersion).toBe(5);

    const v6 = upgradeProjectV5ToV6(v5);
    const parsed = ProjectSchemaV6.parse(v6);
    expect(parsed.formatVersion).toBe(6);
    expect(parsed.melody).toEqual({ clips: [] });
    expect(parsed.tekst.clips).toHaveLength(1);
    expect(parsed.tekst.clips[0]).toEqual({
      id: "line-1",
      startTicks: 100,
      lengthTicks: 2000,
      text: "Whole line",
      sourceSection: "Verse",
      blocks: [
        {
          id: "line-1-block-0",
          startTicks: 100,
          lengthTicks: 2000,
          text: "Whole line",
        },
      ],
    });
    expect(parsed.akordy.clips).toEqual(v5.akordy.clips);
    expect(parsed.audioClips).toEqual(v5.audioClips);
    expect(parsed.assets).toEqual(v5.assets);
    expect(parsed.name).toBe("Song");
    expect(parsed.keyMap).toEqual(v5.keyMap);
  });

  it("rejects unknown keys (strict)", () => {
    const raw = {
      ...createProjectV6Seed("abc", "Song", "2026-07-19T12:00:00.000Z"),
      legacyField: true,
    };
    expect(() => ProjectSchemaV6.parse(raw)).toThrow();
  });

  it("rejects empty name", () => {
    expect(() =>
      ProjectSchema.parse({
        ...createProjectV6Seed("abc", "X", "2026-07-19T12:00:00.000Z"),
        name: "",
      }),
    ).toThrow();
  });

  it("accepts Cue sample config and rejects stale sample bus / asset", () => {
    const seed = createProjectV6Seed("abc", "Song", "2026-07-19T12:00:00.000Z");
    const withAsset = {
      ...seed,
      assets: [
        {
          id: "a1",
          storageName: "hit.wav",
          originalName: "hit.wav",
          kind: "audio" as const,
          mimeType: "audio/wav",
          sizeBytes: 100,
        },
      ],
      audioBusses: [{ id: "bus-a", name: "Bus A" }],
      cue: {
        clips: [
          {
            id: "c1",
            startTicks: 0,
            lengthTicks: 960,
            label: "Hit",
            sample: {
              assetId: "a1",
              mode: "one-shot" as const,
              output: { kind: "bus" as const, busId: "bus-a" },
            },
          },
        ],
      },
    };
    expect(ProjectSchema.parse(withAsset).cue.clips[0]?.sample?.assetId).toBe(
      "a1",
    );

    expect(() =>
      ProjectSchema.parse({
        ...withAsset,
        cue: {
          clips: [
            {
              id: "c1",
              startTicks: 0,
              lengthTicks: 960,
              label: "Hit",
              sample: { assetId: "missing" },
            },
          ],
        },
      }),
    ).toThrow(/audio asset/i);
  });
});
