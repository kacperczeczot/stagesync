import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectSeed, projectEndTicks } from "@stagesync/shared";
import {
  allowAudioPlayback,
  ensureAudioBuffered,
  getAudioPlaybackDebugState,
  restartAudioPlayback,
  shouldSoftStopPastSongEnd,
  stopAudioPlayback,
  suppressAudioPlayback,
  syncAudioPlayback,
} from "./audioPlayback.js";
import {
  cleanupAudioPlayback,
  mockAudioContext,
  mockAudioParam,
  projectWithClipUnderPlayhead,
} from "./audioPlayback.test-helpers.js";

describe("audioPlayback — sync engine", () => {
  afterEach(() => {
    cleanupAudioPlayback();
  });

  it("suppress blocks re-schedule while playing flag still true (#352)", () => {
    const ctx = mockAudioContext({
      createBufferSource: vi.fn(() => {
        throw new Error("must not schedule while suppressed");
      }),
    });

    suppressAudioPlayback();
    expect(getAudioPlaybackDebugState().suppressed).toBe(true);

    const project = createProjectSeed("p1", "Test", "2026-07-22T00:00:00.000Z");
    syncAudioPlayback("p1", { project, playing: true, displayTicks: 0 }, ctx);

    expect(getAudioPlaybackDebugState().activeCount).toBe(0);
    expect(ctx.createBufferSource).not.toHaveBeenCalled();

    allowAudioPlayback();
    expect(getAudioPlaybackDebugState().suppressed).toBe(false);
  });

  it("BUG-05: soft-stops WebAudio past song end while server still playing", async () => {
    const fakeBuf = { duration: 10, numberOfChannels: 2 } as AudioBuffer;
    const source = {
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
    };
    const ctx = mockAudioContext({
      decodeAudioData: vi.fn(async () => fakeBuf),
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
    const endTicks = projectEndTicks(project);
    // Extend clip through song end so a source is active until soft-stop.
    project.audioClips[0] = {
      ...project.audioClips[0]!,
      lengthTicks: endTicks,
    };

    await ensureAudioBuffered("p1", project, 0, ctx);
    syncAudioPlayback("p1", { project, playing: true, displayTicks: 0 }, ctx);
    expect(source.start).toHaveBeenCalledOnce();
    expect(getAudioPlaybackDebugState().activeCount).toBe(1);

    // Server still `playing` during pause-at-end / auto-advance I/O.
    syncAudioPlayback(
      "p1",
      { project, playing: true, displayTicks: endTicks },
      ctx,
    );
    expect(source.stop).toHaveBeenCalled();
    expect(getAudioPlaybackDebugState().activeCount).toBe(0);
    expect(getAudioPlaybackDebugState().suppressed).toBe(false);

    // Soft-stop must not latch suppress — seek/home before pause can resume.
    const source2 = {
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
    };
    (ctx.createBufferSource as ReturnType<typeof vi.fn>).mockImplementation(
      () => source2,
    );
    syncAudioPlayback("p1", { project, playing: true, displayTicks: 0 }, ctx);
    expect(source2.start).toHaveBeenCalledOnce();
    expect(getAudioPlaybackDebugState().activeCount).toBe(1);
  });

  it("WA-MEM-02: stop assigns empty buffer to release decoded PCM", async () => {
    const fakeBuf = { duration: 1, numberOfChannels: 2 } as AudioBuffer;
    const emptyBuf = { duration: 0, numberOfChannels: 1 } as AudioBuffer;
    const source = {
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
      context: null as AudioContext | null,
    };
    const ctx = mockAudioContext({
      decodeAudioData: vi.fn(async () => fakeBuf),
      createBufferSource: vi.fn(() => {
        source.context = ctx;
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
    syncAudioPlayback("p1", { project, playing: true, displayTicks: 0 }, ctx);
    expect(source.buffer).toBe(fakeBuf);

    stopAudioPlayback();
    expect(source.stop).toHaveBeenCalled();
    expect(source.buffer).not.toBe(fakeBuf);
    expect(source.buffer).toEqual(emptyBuf);
  });

  it("BUG-05: song-end soft-stop respects loopEnabled", () => {
    const project = projectWithClipUnderPlayhead();
    const endTicks = projectEndTicks(project);
    expect(
      shouldSoftStopPastSongEnd({
        project,
        playing: true,
        displayTicks: endTicks,
      }),
    ).toBe(true);
    expect(
      shouldSoftStopPastSongEnd({
        project,
        playing: true,
        displayTicks: endTicks,
        loopEnabled: true,
      }),
    ).toBe(false);
    expect(
      shouldSoftStopPastSongEnd({
        project,
        playing: true,
        displayTicks: endTicks - 1,
      }),
    ).toBe(false);
  });

  it("stopAudioPlayback clears active sources and bumps epoch", () => {
    const before = getAudioPlaybackDebugState().stopEpoch;
    stopAudioPlayback();
    const after = getAudioPlaybackDebugState();
    expect(after.activeCount).toBe(0);
    expect(after.stopEpoch).toBeGreaterThan(before);
  });

  it("sync with playing false does not schedule", () => {
    const ctx = mockAudioContext({
      createBufferSource: vi.fn(() => {
        throw new Error("must not schedule when paused");
      }),
    });

    const project = createProjectSeed("p1", "Test", "2026-07-22T00:00:00.000Z");
    syncAudioPlayback(
      "p1",
      { project, playing: false, displayTicks: 480 },
      ctx,
    );
    expect(ctx.createBufferSource).not.toHaveBeenCalled();
    expect(getAudioPlaybackDebugState().activeCount).toBe(0);
  });

  it("schedules fade ramps and loop window on BufferSource", async () => {
    const fakeBuf = { duration: 2, numberOfChannels: 2 } as AudioBuffer;
    const fadeParam = mockAudioParam(1);
    const source = {
      buffer: null as AudioBuffer | null,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
    };
    const fadeGainNode = {
      gain: fadeParam,
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const busGains: unknown[] = [];
    const ctx = mockAudioContext({
      currentTime: 10,
      decodeAudioData: vi.fn(async () => fakeBuf),
      createBufferSource: vi.fn(() => source),
      createGain: vi.fn(() => {
        const node = {
          gain: mockAudioParam(1),
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
        busGains.push(node);
        // Master(1) + stereo track (gain, L, R, route) = 5; then fade + level.
        if (busGains.length === 6) return fadeGainNode;
        return node;
      }),
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      })),
    );

    const project = {
      ...projectWithClipUnderPlayhead(),
      assets: [
        {
          id: "asset-1",
          storageName: "kick.wav",
          originalName: "kick.wav",
          kind: "audio" as const,
          mimeType: "audio/wav",
          sizeBytes: 100,
          durationMs: 2000,
        },
      ],
      audioClips: [
        {
          id: "clip-1",
          trackId: "tr-1",
          assetId: "asset-1",
          startTicks: 0,
          lengthTicks: 1920,
          muted: false,
          gainDb: 0,
          trimInMs: 100,
          trimOutMs: 200,
          fadeInMs: 200,
          fadeOutMs: 100,
          loop: true,
        },
      ],
    };

    await ensureAudioBuffered("p1", project, 0, ctx);
    syncAudioPlayback("p1", { project, playing: true, displayTicks: 0 }, ctx);

    expect(source.loop).toBe(true);
    expect(source.loopStart).toBeCloseTo(0.1, 5);
    expect(source.loopEnd).toBeCloseTo(1.8, 5);
    expect(fadeParam.setValueAtTime).toHaveBeenCalled();
    expect(fadeParam.linearRampToValueAtTime).toHaveBeenCalled();
    expect(source.start).toHaveBeenCalledOnce();
    expect(getAudioPlaybackDebugState().activeCount).toBe(1);
    // Default stereo track → True Balance (splitter + merger), not StereoPanner.
    expect(ctx.createChannelSplitter).toHaveBeenCalled();
    expect(ctx.createChannelMerger).toHaveBeenCalled();
    expect(ctx.createStereoPanner).not.toHaveBeenCalled();
  });

  it("mono track uses StereoPanner; stereo file gets −3 dB downmix", async () => {
    const fakeBuf = { duration: 1, numberOfChannels: 2 } as AudioBuffer;
    const source = {
      buffer: null as AudioBuffer | null,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
    };
    const ctx = mockAudioContext({
      decodeAudioData: vi.fn(async () => fakeBuf),
      createBufferSource: vi.fn(() => source),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      })),
    );

    const project = {
      ...projectWithClipUnderPlayhead(),
      audioTracks: [
        {
          id: "tr-1",
          name: "A1",
          muted: false,
          gainDb: 0,
          channelMode: "mono" as const,
        },
      ],
    };

    await ensureAudioBuffered("p1", project, 0, ctx);
    syncAudioPlayback("p1", { project, playing: true, displayTicks: 0 }, ctx);

    expect(ctx.createStereoPanner).toHaveBeenCalled();
    // Master meter split + stereo→mono downmix splitter.
    expect(ctx.createChannelSplitter).toHaveBeenCalled();
    expect(
      (ctx.createChannelSplitter as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThanOrEqual(2);
    expect(source.start).toHaveBeenCalledOnce();
  });

  it("restartAudioPlayback re-arms graph after stop", async () => {
    const fakeBuf = { duration: 1, numberOfChannels: 1, sampleRate: 48000 };
    const source = {
      buffer: null as unknown,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
    };
    const ctx = mockAudioContext({
      decodeAudioData: vi.fn(async () => fakeBuf),
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
    await ensureAudioBuffered("p1", project, 0, ctx);
    stopAudioPlayback();
    allowAudioPlayback();
    restartAudioPlayback(
      "p1",
      { project, playing: true, displayTicks: 0 },
      ctx,
    );
    expect(source.start).toHaveBeenCalled();
  });
});
