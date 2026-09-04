import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureAudioBuffered,
  getAudioPlaybackDebugState,
  restartAudioPlayback,
  resumeAndSyncAudioPlayback,
  suppressAudioPlayback,
  syncAudioPlayback,
} from "./audioPlayback.js";
import * as metronome from "./metronome.js";
import {
  cleanupAudioPlayback,
  mockAudioContext,
  mockAudioParam,
  mockConnectable,
  projectWithClipUnderPlayhead,
} from "./audioPlayback.test-helpers.js";

describe("audioPlayback — voice gain & fades", () => {
  afterEach(() => {
    cleanupAudioPlayback();
  });

  it("resumeAndSync skips start when suppressed during AudioContext resume", async () => {
    const fakeBuf = { duration: 1, numberOfChannels: 2 } as AudioBuffer;
    const source = {
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
    };
    let finishResume: () => void = () => {};
    const resumePromise = new Promise<void>((resolve) => {
      finishResume = resolve;
    });
    const ctx = mockAudioContext({
      state: "running",
      decodeAudioData: vi.fn(async () => fakeBuf),
      createBufferSource: vi.fn(() => source),
    });
    vi.spyOn(metronome, "getMetronomeAudioContext").mockReturnValue(ctx);
    vi.spyOn(metronome, "resumeMetronomeAudio").mockImplementation(
      () => resumePromise,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      })),
    );

    const project = projectWithClipUnderPlayhead();
    await ensureAudioBuffered("p1", project, 0, ctx);
    const pending = resumeAndSyncAudioPlayback("p1", {
      project,
      playing: true,
      displayTicks: 0,
    });
    suppressAudioPlayback();
    finishResume();
    await pending;
    expect(source.start).not.toHaveBeenCalled();
  });

  it("restartAudioPlayback is a no-op while suppressed", async () => {
    const source = {
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
    };
    const ctx = mockAudioContext({
      createBufferSource: vi.fn(() => source),
      decodeAudioData: vi.fn(async () => ({
        duration: 1,
        numberOfChannels: 2,
      })),
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
    suppressAudioPlayback();
    restartAudioPlayback(
      "p1",
      { project, playing: true, displayTicks: 0 },
      ctx,
    );
    expect(source.start).not.toHaveBeenCalled();
  });

  it("clip gainDb change updates level live without stopping source", async () => {
    const fakeBuf = { duration: 1, numberOfChannels: 2 } as AudioBuffer;
    const source = {
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
    };
    const levelParams: ReturnType<typeof mockAudioParam>[] = [];
    let gainCount = 0;
    const ctx = mockAudioContext({
      decodeAudioData: vi.fn(async () => fakeBuf),
      createBufferSource: vi.fn(() => source),
      createGain: vi.fn(() => {
        gainCount += 1;
        const param = mockAudioParam(1);
        // Master(1) + stereo (4) + fade(6) + level(7)
        if (gainCount === 7) levelParams.push(param);
        return {
          ...mockConnectable(),
          gain: param,
        };
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
    expect(source.start).toHaveBeenCalledOnce();
    expect(levelParams[0]?.value).toBeCloseTo(1, 5);

    const quieter = structuredClone(project);
    quieter.audioClips[0]!.gainDb = -6;
    syncAudioPlayback(
      "p1",
      { project: quieter, playing: true, displayTicks: 10 },
      ctx,
    );
    expect(source.stop).not.toHaveBeenCalled();
    expect(levelParams[0]?.value).toBeCloseTo(10 ** (-6 / 20), 5);
  });

  it("cold buffer seek starts clip after decode completes", async () => {
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
    finishDecode(fakeBuf);
    await vi.waitFor(() => {
      expect(source.start).toHaveBeenCalledOnce();
    });
  });

  it("fade-out zone start anchors setValueAtTime below unity", async () => {
    const fakeBuf = { duration: 2, numberOfChannels: 2 } as AudioBuffer;
    const fadeParam = mockAudioParam(1);
    const source = {
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
    };
    let gainCount = 0;
    const ctx = mockAudioContext({
      currentTime: 10,
      decodeAudioData: vi.fn(async () => fakeBuf),
      createBufferSource: vi.fn(() => source),
      createGain: vi.fn(() => {
        gainCount += 1;
        if (gainCount === 6) {
          return { ...mockConnectable(), gain: fadeParam };
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
          // 2s @ 120 BPM / ppq 960 → covers fade-out zone of 500ms.
          lengthTicks: 3840,
          muted: false,
          gainDb: 0,
          fadeInMs: 0,
          fadeOutMs: 500,
        },
      ],
    };
    await ensureAudioBuffered("p1", project, 0, ctx);
    // ~1.75s into clip (fade-out 500ms on 2s → envelope 0.5).
    syncAudioPlayback(
      "p1",
      { project, playing: true, displayTicks: 3360 },
      ctx,
    );
    expect(fadeParam.setValueAtTime).toHaveBeenCalled();
    const initial = fadeParam.setValueAtTime.mock.calls[0]![0] as number;
    expect(initial).toBeLessThan(1);
    expect(initial).toBeGreaterThanOrEqual(0);
  });

  it("fader apply dezippers GainNode (no instant .value while graph live)", async () => {
    const fakeBuf = { duration: 1, numberOfChannels: 2 } as AudioBuffer;
    const source = {
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
    };
    const trackGainParams: ReturnType<typeof mockAudioParam>[] = [];
    let gainCount = 0;
    const ctx = mockAudioContext({
      currentTime: 1.5,
      decodeAudioData: vi.fn(async () => fakeBuf),
      createBufferSource: vi.fn(() => source),
      createGain: vi.fn(() => {
        gainCount += 1;
        const param = mockAudioParam(1);
        // Master(1) + mono track gain(2) …
        if (gainCount === 2) trackGainParams.push(param);
        return { ...mockConnectable(), gain: param };
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
    const gainParam = trackGainParams[0]!;
    gainParam.linearRampToValueAtTime.mockClear();
    gainParam.setValueAtTime.mockClear();
    gainParam.cancelScheduledValues.mockClear();

    suppressAudioPlayback();
    const quieter = structuredClone(project);
    quieter.audioTracks[0]!.gainDb = -6;
    syncAudioPlayback(
      "p1",
      { project: quieter, playing: true, displayTicks: 0 },
      ctx,
    );

    expect(gainParam.cancelScheduledValues).toHaveBeenCalled();
    expect(gainParam.setValueAtTime).toHaveBeenCalled();
    expect(gainParam.linearRampToValueAtTime).toHaveBeenCalledWith(
      expect.closeTo(10 ** (-6 / 20), 5),
      expect.closeTo(1.5 + 0.012, 5),
    );
  });

  it("dezipper skips re-ramp when the same target is already scheduled", () => {
    const gains: ReturnType<typeof mockAudioParam>[] = [];
    const ctx = mockAudioContext({
      createGain: vi.fn(() => {
        const g = mockAudioParam(1);
        gains.push(g);
        return { ...mockConnectable(), gain: g };
      }),
    });

    const project = {
      ...projectWithClipUnderPlayhead(),
      masterGainDb: -6,
    };
    syncAudioPlayback("p1", { project, playing: false, displayTicks: 0 }, ctx);
    expect(gains.length).toBeGreaterThan(0);
    // Master is the first GainNode in ensureMasterBus.
    const masterParam = gains[0]!;
    const cancelsAfterFirst =
      masterParam.cancelScheduledValues.mock.calls.length;
    expect(cancelsAfterFirst).toBeGreaterThan(0);

    // Same master gain on later ticks must not cancel/re-ramp.
    syncAudioPlayback("p1", { project, playing: false, displayTicks: 0 }, ctx);
    syncAudioPlayback("p1", { project, playing: false, displayTicks: 0 }, ctx);
    expect(masterParam.cancelScheduledValues.mock.calls.length).toBe(
      cancelsAfterFirst,
    );
  });

  it("stale BufferSource ended does not drop a replacement voice for the same clip", async () => {
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
    syncAudioPlayback("p1", { project, playing: true, displayTicks: 0 }, ctx);
    expect(sources).toHaveLength(1);
    const staleEnded = sources[0]!.onended;
    expect(staleEnded).toEqual(expect.any(Function));

    // Graph rebuild (mute) stops voice 1 and starts voice 2 for the same clip.
    const muted = {
      ...project,
      audioTracks: [{ ...project.audioTracks[0]!, muted: true }],
    };
    syncAudioPlayback(
      "p1",
      { project: muted, playing: true, displayTicks: 0 },
      ctx,
    );
    expect(getAudioPlaybackDebugState().activeCount).toBe(0);

    const unmuted = {
      ...project,
      audioTracks: [{ ...project.audioTracks[0]!, muted: false }],
    };
    syncAudioPlayback(
      "p1",
      { project: unmuted, playing: true, displayTicks: 0 },
      ctx,
    );
    expect(sources).toHaveLength(2);
    expect(getAudioPlaybackDebugState().activeCount).toBe(1);

    // Old source's ended must not clear the new voice (clipId collision bug).
    staleEnded!();
    expect(getAudioPlaybackDebugState().activeCount).toBe(1);

    // Sync must not re-start another BufferSource for a still-active clip.
    const startsBefore = sources.length;
    syncAudioPlayback(
      "p1",
      { project: unmuted, playing: true, displayTicks: 10 },
      ctx,
    );
    expect(sources).toHaveLength(startsBefore);
    expect(getAudioPlaybackDebugState().activeCount).toBe(1);
  });
});
