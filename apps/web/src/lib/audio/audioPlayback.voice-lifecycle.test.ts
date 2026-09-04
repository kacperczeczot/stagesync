import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureAudioBuffered,
  getAudioPlaybackDebugState,
  syncAudioPlayback,
} from "./audioPlayback.js";
import {
  cleanupAudioPlayback,
  mockAudioContext,
  mockAudioParam,
  mockConnectable,
  projectWithClipUnderPlayhead,
} from "./audioPlayback.test-helpers.js";

describe("audioPlayback — voice lifecycle & transitions", () => {
  afterEach(() => {
    cleanupAudioPlayback();
  });

  it("seek while playing tears down prior voice and does not stack overlaps", async () => {
    // Long clip so playhead stays inside after large seeks (> SEEK_JUMP_TICKS).
    const fakeBuf = { duration: 10, numberOfChannels: 2 } as AudioBuffer;
    const sources: Array<{
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
      onended: (() => void) | null;
      context: BaseAudioContext;
      buffer: AudioBuffer | null;
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
    }> = [];
    const ctx = mockAudioContext({
      decodeAudioData: vi.fn(async () => fakeBuf),
      createBufferSource: vi.fn(() => {
        const source = {
          buffer: null as AudioBuffer | null,
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          onended: null as (() => void) | null,
          context: { sampleRate: 44100 } as BaseAudioContext,
        };
        sources.push(source);
        return source;
      }),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      })),
    );

    const seed = projectWithClipUnderPlayhead();
    const project = {
      ...seed,
      assets: [
        {
          ...seed.assets[0]!,
          durationMs: 10_000,
        },
      ],
      audioClips: [
        {
          ...seed.audioClips[0]!,
          lengthTicks: 960 * 16,
        },
      ],
    };
    await ensureAudioBuffered("p1", project, 0, ctx);
    syncAudioPlayback("p1", { project, playing: true, displayTicks: 0 }, ctx);
    expect(sources).toHaveLength(1);
    expect(getAudioPlaybackDebugState().activeCount).toBe(1);
    const first = sources[0]!;
    const staleEnded = first.onended;

    // Scrub jump while playing — prior BufferSource must stop before reschedule.
    syncAudioPlayback("p1", { project, playing: true, displayTicks: 960 }, ctx);
    expect(first.stop).toHaveBeenCalled();
    expect(first.onended).toBeNull();
    expect(sources).toHaveLength(2);
    expect(getAudioPlaybackDebugState().activeCount).toBe(1);

    // Late ended from the torn-down voice must not drop the post-seek voice
    // (would re-schedule on next tick → stacked overlapping playback).
    staleEnded?.();
    expect(getAudioPlaybackDebugState().activeCount).toBe(1);

    syncAudioPlayback(
      "p1",
      { project, playing: true, displayTicks: 1920 },
      ctx,
    );
    syncAudioPlayback(
      "p1",
      { project, playing: true, displayTicks: 2880 },
      ctx,
    );
    expect(getAudioPlaybackDebugState().activeCount).toBe(1);
    expect(sources).toHaveLength(4);
    expect(sources[1]!.stop).toHaveBeenCalled();
    expect(sources[2]!.stop).toHaveBeenCalled();
    expect(sources[3]!.stop).not.toHaveBeenCalled();

    // Small tick advance (no seek jump) must not start another voice.
    const n = sources.length;
    syncAudioPlayback(
      "p1",
      { project, playing: true, displayTicks: 2890 },
      ctx,
    );
    expect(sources).toHaveLength(n);
    expect(getAudioPlaybackDebugState().activeCount).toBe(1);
  });

  it("deleting clip while playing mutes gains and releases voice", async () => {
    const fakeBuf = { duration: 1, numberOfChannels: 2 } as AudioBuffer;
    const fadeParam = mockAudioParam(0.75);
    const levelParam = mockAudioParam(1);
    const source = {
      buffer: null as AudioBuffer | null,
      context: null as AudioContext | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
    };
    let gainCount = 0;
    const ctx = mockAudioContext({
      currentTime: 5,
      decodeAudioData: vi.fn(async () => fakeBuf),
      createBufferSource: vi.fn(() => {
        source.context = ctx;
        return source;
      }),
      createGain: vi.fn(() => {
        gainCount += 1;
        // Master(1) + stereo track (gain, L, R, route) = 5; fade(6) + level(7)
        if (gainCount === 6) {
          return { ...mockConnectable(), gain: fadeParam };
        }
        if (gainCount === 7) {
          return { ...mockConnectable(), gain: levelParam };
        }
        return { ...mockConnectable(), gain: mockAudioParam(1) };
      }),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      })),
    );

    const project = projectWithClipUnderPlayhead();
    await ensureAudioBuffered("p1", project, 0, ctx);
    syncAudioPlayback("p1", { project, playing: true, displayTicks: 0 }, ctx);
    expect(getAudioPlaybackDebugState().activeCount).toBe(1);

    fadeParam.cancelScheduledValues.mockClear();
    fadeParam.setValueAtTime.mockClear();
    levelParam.cancelScheduledValues.mockClear();
    levelParam.setValueAtTime.mockClear();
    source.stop.mockClear();
    source.disconnect.mockClear();

    const withoutClip = {
      ...project,
      audioClips: [] as typeof project.audioClips,
    };
    syncAudioPlayback(
      "p1",
      { project: withoutClip, playing: true, displayTicks: 0 },
      ctx,
    );

    expect(source.stop).toHaveBeenCalled();
    expect(source.disconnect).toHaveBeenCalled();
    expect(fadeParam.cancelScheduledValues).toHaveBeenCalledWith(5);
    expect(fadeParam.setValueAtTime).toHaveBeenCalledWith(0, 5);
    expect(levelParam.cancelScheduledValues).toHaveBeenCalledWith(5);
    expect(levelParam.setValueAtTime).toHaveBeenCalledWith(0, 5);
    expect(getAudioPlaybackDebugState().activeCount).toBe(0);
  });

  it("graph change restarts remaining clips after stopEpoch bump", async () => {
    const fakeBuf = { duration: 10, numberOfChannels: 2 } as AudioBuffer;
    const sources: Array<{
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
    }> = [];
    const ctx = mockAudioContext({
      decodeAudioData: vi.fn(async () => fakeBuf),
      createBufferSource: vi.fn(() => {
        const source = {
          buffer: null as AudioBuffer | null,
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          onended: null as (() => void) | null,
          context: { sampleRate: 44100, currentTime: 0 } as BaseAudioContext,
        };
        sources.push(source);
        return source;
      }),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      })),
    );

    const base = projectWithClipUnderPlayhead();
    const project = {
      ...base,
      assets: [
        ...base.assets,
        {
          id: "asset-2",
          storageName: "snare.wav",
          originalName: "snare.wav",
          kind: "audio" as const,
          mimeType: "audio/wav",
          sizeBytes: 100,
          durationMs: 10_000,
        },
      ],
      audioClips: [
        base.audioClips[0]!,
        {
          id: "clip-2",
          trackId: "tr-1",
          assetId: "asset-2",
          startTicks: 0,
          lengthTicks: 960 * 16,
          muted: false,
          gainDb: 0,
        },
      ],
    };
    await ensureAudioBuffered("p1", project, 0, ctx);
    syncAudioPlayback("p1", { project, playing: true, displayTicks: 0 }, ctx);
    expect(getAudioPlaybackDebugState().activeCount).toBe(2);
    expect(sources).toHaveLength(2);

    const withoutFirst = {
      ...project,
      audioClips: project.audioClips.filter((c) => c.id !== "clip-1"),
    };
    syncAudioPlayback(
      "p1",
      { project: withoutFirst, playing: true, displayTicks: 0 },
      ctx,
    );

    expect(sources[0]!.stop).toHaveBeenCalled();
    expect(getAudioPlaybackDebugState().activeCount).toBe(1);
    expect(sources).toHaveLength(3);
    expect(sources[2]!.start).toHaveBeenCalled();
  });

  it("in-flight decode for deleted clip does not start after delete", async () => {
    const fakeBuf = { duration: 1, numberOfChannels: 2 } as AudioBuffer;
    let finishDecode: (buf: AudioBuffer) => void = () => {};
    const decodePromise = new Promise<AudioBuffer>((resolve) => {
      finishDecode = resolve;
    });
    const source = {
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
      context: { sampleRate: 44100, currentTime: 0 } as BaseAudioContext,
    };
    const ctx = mockAudioContext({
      decodeAudioData: vi.fn(() => decodePromise),
      createBufferSource: vi.fn(() => source),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      })),
    );

    const project = projectWithClipUnderPlayhead();
    syncAudioPlayback("p1", { project, playing: true, displayTicks: 0 }, ctx);
    expect(source.start).not.toHaveBeenCalled();

    const withoutClip = {
      ...project,
      audioClips: [] as typeof project.audioClips,
    };
    syncAudioPlayback(
      "p1",
      { project: withoutClip, playing: true, displayTicks: 0 },
      ctx,
    );
    expect(getAudioPlaybackDebugState().activeCount).toBe(0);

    finishDecode(fakeBuf);
    await vi.waitFor(() => {
      expect(ctx.decodeAudioData).toHaveBeenCalled();
    });
    expect(source.start).not.toHaveBeenCalled();
    expect(getAudioPlaybackDebugState().activeCount).toBe(0);
  });

  it("loop wrap (backward jump) stops active sources so clip at exclusive end does not ring", async () => {
    const fakeBuf = { duration: 2, numberOfChannels: 2 } as AudioBuffer;
    const sources: Array<{
      buffer: AudioBuffer | null;
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
      onended: (() => void) | null;
      context: BaseAudioContext;
    }> = [];
    const ctx = mockAudioContext({
      decodeAudioData: vi.fn(async () => fakeBuf),
      createBufferSource: vi.fn(() => {
        const source = {
          buffer: null as AudioBuffer | null,
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          onended: null as (() => void) | null,
          context: { sampleRate: 44100 } as BaseAudioContext,
        };
        sources.push(source);
        return source;
      }),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      })),
    );

    const project = projectWithClipUnderPlayhead();
    await ensureAudioBuffered("p1", project, 0, ctx);

    // Simulate playback near end of short loop: ticks = 400 (< SEEK_JUMP_TICKS)
    syncAudioPlayback(
      "p1",
      { project, playing: true, displayTicks: 400, loopEnabled: true },
      ctx,
    );
    expect(getAudioPlaybackDebugState().activeCount).toBe(1);

    // Wrap: ticks jump backward to 0 (loop restart)
    syncAudioPlayback(
      "p1",
      { project, playing: true, displayTicks: 0, loopEnabled: true },
      ctx,
    );
    // First source must have been stopped (loop wrap tear-down)
    expect(sources[0]!.stop).toHaveBeenCalled();
    // A new source may have been started for the clip at tick 0
    expect(getAudioPlaybackDebugState().activeCount).toBeLessThanOrEqual(1);
  });
});
