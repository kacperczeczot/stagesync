import { describe, expect, it } from "vitest";
import {
  BatchMidiPcBodySchema,
  ExportLibraryBodySchema,
  FormaClipSchema,
  LibrarySchema,
  MeterEventSchema,
  MidiHostConfigSchema,
  ProjectIdSchema,
  ProjectSchemaV5,
  PutMidiHostConfigBodySchema,
  PutSetlistBodySchema,
  SetlistSchema,
} from "./schema.js";
import { createProjectV5Seed } from "./project-seed.js";

describe("LibrarySchema", () => {
  it("parses a valid catalog", () => {
    const raw = {
      version: 1,
      projects: [
        {
          id: "p1",
          name: "Demo",
          updatedAt: "2026-07-19T12:00:00.000Z",
          midiProgramId: 1,
        },
      ],
    };
    expect(LibrarySchema.parse(raw)).toEqual(raw);
  });

  it("accepts denormalized BPM / key / duration badges", () => {
    const raw = {
      version: 1 as const,
      projects: [
        {
          id: "p1",
          name: "Demo",
          defaultBpm: 120,
          keyLabel: "Am",
          durationMs: 180_000,
        },
      ],
    };
    expect(LibrarySchema.parse(raw)).toEqual(raw);
  });

  it("rejects wrong version", () => {
    expect(() => LibrarySchema.parse({ version: 2, projects: [] })).toThrow();
  });
});

describe("MeterEventSchema edges", () => {
  it("rejects invalid meter for PPQ", () => {
    expect(() =>
      MeterEventSchema.parse({
        id: "m2",
        startTicks: 0,
        numerator: 5,
        denominator: 7,
      }),
    ).toThrow();
  });
});

describe("FormaClipSchema", () => {
  it("allows negative startTicks for countdown; section may be negative int", () => {
    expect(
      FormaClipSchema.parse({
        id: "cd",
        name: "CD",
        startTicks: -3840,
        lengthTicks: 3840,
        kind: "countdown",
      }).kind,
    ).toBe("countdown");
    expect(
      FormaClipSchema.parse({
        id: "sec",
        name: "Verse",
        startTicks: -1,
        lengthTicks: 3840,
        kind: "section",
      }).startTicks,
    ).toBe(-1);
  });
});

describe("ProjectIdSchema", () => {
  it("accepts UUID and rejects non-uuid", () => {
    expect(ProjectIdSchema.parse("11111111-1111-4111-8111-111111111111")).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(() => ProjectIdSchema.parse("not-a-uuid")).toThrow();
    expect(() => ProjectIdSchema.parse("../escape")).toThrow();
  });
});

describe("DefaultMeter refine + Setlist coerce", () => {
  it("rejects meters that yield non-integer ticksPerBar", () => {
    const seed = createProjectV5Seed("abc", "Song", "2026-07-19T12:00:00.000Z");
    expect(() =>
      ProjectSchemaV5.parse({
        ...seed,
        defaultMeter: { numerator: 5, denominator: 7 },
      }),
    ).toThrow();
  });

  it("SetlistSchema coerces projectIds ↔ items", () => {
    const fromIds = SetlistSchema.parse({
      version: 1,
      enabled: true,
      projectIds: ["11111111-1111-4111-8111-111111111111"],
      autoAdvance: { enabled: false },
      timeBudgetMinutes: 60,
    });
    expect(fromIds.items).toEqual([
      {
        type: "project",
        projectId: "11111111-1111-4111-8111-111111111111",
      },
    ]);

    const fromItems = SetlistSchema.parse({
      version: 1,
      enabled: true,
      items: [
        {
          type: "project",
          projectId: "11111111-1111-4111-8111-111111111111",
        },
        {
          type: "break",
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          label: "Break",
          durationMinutes: 5,
        },
      ],
      autoAdvance: { enabled: false },
      timeBudgetMinutes: 60,
    });
    expect(fromItems.projectIds).toEqual([
      "11111111-1111-4111-8111-111111111111",
    ]);
  });

  it("PutSetlistBodySchema requires items or projectIds", () => {
    expect(() => PutSetlistBodySchema.parse({ enabled: true })).toThrow(
      /Provide items or projectIds/,
    );
    expect(
      PutSetlistBodySchema.parse({
        enabled: true,
        projectIds: ["11111111-1111-4111-8111-111111111111"],
      }).projectIds,
    ).toHaveLength(1);
  });

  it("SetlistSchema keeps object when both items and projectIds present", () => {
    const both = SetlistSchema.parse({
      version: 1,
      enabled: true,
      items: [
        {
          type: "project",
          projectId: "11111111-1111-4111-8111-111111111111",
        },
      ],
      projectIds: ["11111111-1111-4111-8111-111111111111"],
      autoAdvance: { enabled: false },
      timeBudgetMinutes: 60,
    });
    expect(both.items).toHaveLength(1);
    expect(both.projectIds).toHaveLength(1);
  });

  it("normalizeKeyTonic validates and falls back", async () => {
    const { normalizeKeyTonic } = await import("./schema.js");
    expect(normalizeKeyTonic("G")).toBe("G");
    expect(normalizeKeyTonic("nope", "D")).toBe("D");
    expect(normalizeKeyTonic(1)).toBe("C");
  });

  it("BatchMidiPcBodySchema accepts assignments and rejects out-of-range PC", () => {
    expect(
      BatchMidiPcBodySchema.parse({
        assignments: [{ id: "p1", midiProgramId: 0 }],
      }).assignments,
    ).toHaveLength(1);
    expect(() =>
      BatchMidiPcBodySchema.parse({
        assignments: [{ id: "p1", midiProgramId: 128 }],
      }),
    ).toThrow();
    expect(() => BatchMidiPcBodySchema.parse({ assignments: "x" })).toThrow();
  });

  it("ExportLibraryBodySchema requires UUID projectIds when present", () => {
    expect(ExportLibraryBodySchema.parse({})).toEqual({});
    expect(
      ExportLibraryBodySchema.parse({
        projectIds: ["11111111-1111-4111-8111-111111111111"],
      }).projectIds,
    ).toHaveLength(1);
    expect(() =>
      ExportLibraryBodySchema.parse({ projectIds: ["not-a-uuid"] }),
    ).toThrow();
  });

  it("PutMidiHostConfigBodySchema is partial and strict", () => {
    expect(PutMidiHostConfigBodySchema.parse({})).toEqual({});
    expect(
      PutMidiHostConfigBodySchema.parse({
        inputId: null,
        clockOutEnabled: true,
        inputChannel: 3,
        outputChannel: 5,
      }),
    ).toEqual({
      inputId: null,
      clockOutEnabled: true,
      inputChannel: 3,
      outputChannel: 5,
    });
    expect(() => PutMidiHostConfigBodySchema.parse({ inputId: "" })).toThrow();
    expect(() => PutMidiHostConfigBodySchema.parse({ extra: true })).toThrow();
    expect(() =>
      PutMidiHostConfigBodySchema.parse({ inputChannel: 16 }),
    ).toThrow();
    expect(() =>
      PutMidiHostConfigBodySchema.parse({ outputChannel: -1 }),
    ).toThrow();
  });

  it("MidiHostConfigSchema defaults missing channels (legacy files)", () => {
    expect(
      MidiHostConfigSchema.parse({
        inputId: null,
        outputId: null,
        clockOutEnabled: true,
      }),
    ).toEqual({
      inputId: null,
      outputId: null,
      clockOutEnabled: true,
      inputChannel: null,
      outputChannel: 0,
    });
  });
});
