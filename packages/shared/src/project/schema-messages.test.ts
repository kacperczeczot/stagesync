import { describe, expect, it } from "vitest";
import {
  ClientHelloMessageSchema,
  CreateProjectBodySchema,
  HealthResponseSchema,
  HEXSPEAK,
  PROTOCOL_VERSION,
  PutProjectBodySchema,
  StageMessageBodySchema,
  UiHashFileSchema,
  UiManifestSchema,
} from "./schema.js";
import { createProjectV6Seed } from "./project-seed.js";

describe("CreateProjectBodySchema", () => {
  it("requires a non-empty name", () => {
    expect(CreateProjectBodySchema.parse({ name: "New" })).toEqual({
      name: "New",
    });
    expect(() => CreateProjectBodySchema.parse({ name: "" })).toThrow();
    expect(() => CreateProjectBodySchema.parse({})).toThrow();
  });

  it("rejects names longer than 200 chars", () => {
    expect(() =>
      CreateProjectBodySchema.parse({ name: "x".repeat(201) }),
    ).toThrow();
  });

  it("rejects whitespace-only name, unknown keys; keeps optional flags", () => {
    expect(() => CreateProjectBodySchema.parse({ name: "   " })).toThrow();
    expect(() =>
      CreateProjectBodySchema.parse({ name: "Ok", extra: true }),
    ).toThrow();
    expect(
      CreateProjectBodySchema.parse({
        name: " From tpl ",
        fromTemplateId: "tpl-1",
        isTemplate: true,
      }),
    ).toEqual({
      name: "From tpl",
      fromTemplateId: "tpl-1",
      isTemplate: true,
    });
  });
});

describe("ClientHelloMessageSchema", () => {
  it("accepts minimal hello and optional fields", () => {
    expect(ClientHelloMessageSchema.parse({ type: "client_hello" })).toEqual({
      type: "client_hello",
    });
    expect(
      ClientHelloMessageSchema.parse({
        type: "client_hello",
        displayName: "Pad",
        roles: ["karaoke", "grid"],
        latencyMs: 12.5,
      }),
    ).toMatchObject({
      displayName: "Pad",
      roles: ["karaoke", "grid"],
      latencyMs: 12.5,
    });
  });

  it("rejects bad type, roles, latency, and unknown keys", () => {
    expect(() => ClientHelloMessageSchema.parse({ type: "hello" })).toThrow();
    expect(() =>
      ClientHelloMessageSchema.parse({
        type: "client_hello",
        roles: ["karaoke", "grid", "score"],
      }),
    ).toThrow();
    expect(() =>
      ClientHelloMessageSchema.parse({
        type: "client_hello",
        roles: ["admin"],
      }),
    ).toThrow();
    expect(() =>
      ClientHelloMessageSchema.parse({
        type: "client_hello",
        latencyMs: Number.NaN,
      }),
    ).toThrow();
    expect(() =>
      ClientHelloMessageSchema.parse({
        type: "client_hello",
        latencyMs: -1,
      }),
    ).toThrow();
    expect(() =>
      ClientHelloMessageSchema.parse({ type: "client_hello", extra: 1 }),
    ).toThrow();
  });
});

describe("PutProjectBodySchema", () => {
  it("parses full v6 body without id (keeps updatedAt for OCC)", () => {
    const full = createProjectV6Seed("abc", "Song", "2026-07-19T12:00:00.000Z");
    const { id, ...body } = full;
    void id;
    const parsed = PutProjectBodySchema.parse(body);
    expect(parsed.name).toBe("Song");
    expect(parsed.updatedAt).toBe("2026-07-19T12:00:00.000Z");
    expect(parsed.formatVersion).toBe(6);
    expect(parsed.melody).toEqual({ clips: [] });
  });

  it("rejects unknown keys", () => {
    const full = createProjectV6Seed("abc", "Song", "2026-07-19T12:00:00.000Z");
    const { id, ...body } = full;
    void id;
    expect(() => PutProjectBodySchema.parse({ ...body, extra: 1 })).toThrow();
  });

  it("rejects stale audio bus output on PUT body", () => {
    const full = createProjectV6Seed("abc", "Song", "2026-07-19T12:00:00.000Z");
    const { id, ...body } = full;
    void id;
    const bad = {
      ...body,
      audioTracks: [
        {
          id: "t1",
          name: "Track 1",
          output: { kind: "bus" as const, busId: "ghost-bus" },
        },
      ],
    };
    expect(() => PutProjectBodySchema.parse(bad)).toThrow(/busId not found/i);
  });
});

describe("StageMessageBodySchema", () => {
  it("accepts ttlMs within 24h", () => {
    expect(
      StageMessageBodySchema.parse({ text: "Go!", ttlMs: 10_000 }),
    ).toEqual({ text: "Go!", ttlMs: 10_000 });
  });

  it("rejects ttlMs above 24h and negative", () => {
    expect(() =>
      StageMessageBodySchema.parse({ text: "Go!", ttlMs: 86_400_001 }),
    ).toThrow();
    expect(() =>
      StageMessageBodySchema.parse({ text: "Go!", ttlMs: -1 }),
    ).toThrow();
  });

  it("accepts ttlMs 0 as infinite and optional priority", () => {
    expect(
      StageMessageBodySchema.parse({
        text: "Hold",
        ttlMs: 0,
        priority: "alert",
      }),
    ).toEqual({ text: "Hold", ttlMs: 0, priority: "alert" });
  });

  it("rejects empty text and unknown priority", () => {
    expect(() => StageMessageBodySchema.parse({ text: "" })).toThrow();
    expect(() =>
      StageMessageBodySchema.parse({ text: "X", priority: "urgent" }),
    ).toThrow();
  });
});

describe("HealthResponseSchema + UI meta (#692)", () => {
  it("parses health with optional hostname", () => {
    const raw = {
      ok: true as const,
      service: "stagesync-server" as const,
      version: "5.3.0",
      protocolVersion: PROTOCOL_VERSION,
      uiHash: "abc123",
      hostname: "FOH Mac Mini",
    };
    expect(HealthResponseSchema.parse(raw)).toEqual(raw);
  });

  it("parses health with protocolVersion and uiHash", () => {
    const raw = {
      ok: true as const,
      service: "stagesync-server" as const,
      version: "5.1.3",
      protocolVersion: PROTOCOL_VERSION,
      uiHash: "abc123",
    };
    expect(HealthResponseSchema.parse(raw)).toEqual(raw);
  });

  it("parses health with additive role ui hashes", () => {
    const raw = {
      ok: true as const,
      service: "stagesync-server" as const,
      version: "5.1.3",
      protocolVersion: PROTOCOL_VERSION,
      uiHash: "full",
      uiHashPerformer: "perf",
      uiHashConsole: "cons",
    };
    expect(HealthResponseSchema.parse(raw)).toEqual(raw);
  });

  it("parses optional themeDefault", () => {
    expect(
      HealthResponseSchema.parse({
        ok: true,
        service: "stagesync-server",
        version: "5.2.0",
        protocolVersion: PROTOCOL_VERSION,
        uiHash: "x",
        themeDefault: "daylight",
      }).themeDefault,
    ).toBe("daylight");
  });

  it("rejects legacy themeDefault aliases", () => {
    expect(() =>
      HealthResponseSchema.parse({
        ok: true,
        service: "stagesync-server",
        version: "5.2.0",
        protocolVersion: PROTOCOL_VERSION,
        uiHash: "x",
        themeDefault: "light-high",
      }),
    ).toThrow();
  });

  it("rejects health missing uiHash (strict)", () => {
    expect(() =>
      HealthResponseSchema.parse({
        ok: true,
        service: "stagesync-server",
        version: "5.1.3",
        protocolVersion: 1,
      }),
    ).toThrow();
  });

  it("rejects unknown health keys", () => {
    expect(() =>
      HealthResponseSchema.parse({
        ok: true,
        service: "stagesync-server",
        version: "5.1.3",
        protocolVersion: 1,
        uiHash: "x",
        extra: true,
      }),
    ).toThrow();
  });

  it("parses ui-hash.json and ui-manifest", () => {
    expect(
      UiHashFileSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        uiHash: HEXSPEAK.DEAD_BEEF_HASH,
      }),
    ).toEqual({ protocolVersion: 1, uiHash: HEXSPEAK.DEAD_BEEF_HASH });

    const manifest = {
      protocolVersion: PROTOCOL_VERSION,
      uiHash: HEXSPEAK.CAFE_BABE_HASH,
      assets: [{ path: "/index.html", hash: "aa", size: 12 }],
    };
    expect(UiManifestSchema.parse(manifest)).toEqual(manifest);

    // Easter egg hexspeak values parse cleanly
    for (const hash of [
      HEXSPEAK.BAAD_F00D_HASH,
      HEXSPEAK.C0FFEE_HASH,
      HEXSPEAK.STAGE_HASH,
    ]) {
      expect(
        UiHashFileSchema.parse({
          protocolVersion: PROTOCOL_VERSION,
          uiHash: hash,
        }).uiHash,
      ).toBe(hash);
    }
  });
});
