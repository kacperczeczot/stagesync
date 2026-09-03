/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getTransport, fetchLiveDesk, wsReconnectDelayMs } = vi.hoisted(() => ({
  getTransport: vi.fn(),
  fetchLiveDesk: vi.fn(),
  wsReconnectDelayMs: vi.fn(() => 1000),
}));

vi.mock("./api.js", () => ({
  getTransport,
  playTransport: vi.fn(),
  pauseTransport: vi.fn(),
  stopTransport: vi.fn(),
  seekTransport: vi.fn(),
  setTransportLoop: vi.fn(),
}));

vi.mock("@lib/shell-operator/setlistApi.js", () => ({
  fetchLiveDesk,
}));

vi.mock("./wsReconnect.js", () => ({
  wsReconnectDelayMs,
}));

import { useTransport } from "./useTransport.js";
import {
  CUE_ID,
  CUE_ID_B,
  flushMicrotasks,
  flushRaf,
  MockWebSocket,
  mountProvider,
  openLatestWs,
  rafQueue,
  resetRafQueue,
  setupRafMock,
  snap,
  tickPayload,
  wrapper,
} from "./transport.test-helpers.js";

describe("TransportProvider WS messages", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    resetRafQueue();
    setupRafMock();

    getTransport.mockReset().mockResolvedValue(snap());
    fetchLiveDesk.mockReset().mockResolvedValue({
      transpositionSemitones: 2,
      syncLeadMs: 100,
      clientEditEnabled: false,
    });
    wsReconnectDelayMs.mockReset().mockReturnValue(1000);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe("ws.onmessage", () => {
    it("applies transport_tick and starts rAF when playing", async () => {
      const { result } = await mountProvider();
      const ws = await openLatestWs();

      await act(async () => {
        ws.triggerMessage(
          tickPayload({
            playing: true,
            positionTicks: 480,
            serverTimeMs: 20,
            sentAtMs: Date.now() - 40,
          }),
        );
      });

      expect(result.current.state.playing).toBe(true);
      expect(result.current.displayTicks).toBe(480);
      expect(result.current.latencyMs).not.toBeNull();
      expect(rafQueue.length).toBeGreaterThan(0);

      await act(async () => {
        flushRaf(100);
      });
      expect(result.current.displayTicks).toBeGreaterThanOrEqual(480);
    });

    it("re-renders useTransport consumers on each rAF while ticks advance", async () => {
      let renderCount = 0;
      const { result } = renderHook(
        () => {
          renderCount += 1;
          return useTransport();
        },
        { wrapper },
      );
      await flushMicrotasks();
      const ws = await openLatestWs();

      await act(async () => {
        ws.triggerMessage(
          tickPayload({
            playing: true,
            positionTicks: 0,
            bpm: 120,
            serverTimeMs: 20,
          }),
        );
      });
      expect(rafQueue.length).toBeGreaterThan(0);

      const rendersAtPlay = renderCount;
      const ticksAtPlay = result.current.displayTicks;
      const frames = 8;
      const tickSamples: number[] = [];

      for (let i = 1; i <= frames; i += 1) {
        await act(async () => {
          flushRaf(performance.now() + i * 16);
        });
        tickSamples.push(result.current.displayTicks);
      }

      expect(renderCount - rendersAtPlay).toBe(frames);
      expect(new Set(tickSamples).size).toBe(frames);
      expect(tickSamples.at(-1)!).toBeGreaterThan(ticksAtPlay);
    });

    it("does not re-render useTransport when rAF ticks stay equal", async () => {
      let renderCount = 0;
      const { result } = renderHook(
        () => {
          renderCount += 1;
          return useTransport();
        },
        { wrapper },
      );
      await flushMicrotasks();
      const ws = await openLatestWs();

      await act(async () => {
        ws.triggerMessage(
          tickPayload({
            playing: true,
            positionTicks: 0,
            bpm: 120,
            serverTimeMs: 21,
          }),
        );
      });
      expect(rafQueue.length).toBeGreaterThan(0);

      const frameTime = performance.now() + 16;
      await act(async () => {
        flushRaf(frameTime);
      });
      const rendersAfterAdvance = renderCount;
      const ticks = result.current.displayTicks;

      await act(async () => {
        flushRaf(frameTime);
      });
      expect(result.current.displayTicks).toBe(ticks);
      expect(renderCount).toBe(rendersAfterAdvance);
    });

    it("drops out-of-order ticks", async () => {
      const { result } = await mountProvider();
      const ws = await openLatestWs();

      await act(async () => {
        ws.triggerMessage(
          tickPayload({ positionTicks: 1000, serverTimeMs: 50 }),
        );
      });
      await act(async () => {
        ws.triggerMessage(tickPayload({ positionTicks: 1, serverTimeMs: 40 }));
      });

      expect(result.current.state.positionTicks).toBe(1000);
    });

    it("handles stage_cue upsert and dismiss by id / clearAll", async () => {
      const { result } = await mountProvider();
      const ws = await openLatestWs();

      await act(async () => {
        ws.triggerMessage({
          type: "stage_cue",
          id: CUE_ID,
          text: "GO",
          ttlMs: 1000,
          sentAtMs: 1,
        });
      });
      expect(result.current.stageCue?.text).toBe("GO");
      expect(result.current.stageCues).toHaveLength(1);

      await act(async () => {
        ws.triggerMessage({
          type: "stage_cue",
          id: CUE_ID,
          text: "UPDATED",
          ttlMs: 2000,
          sentAtMs: 2,
        });
      });
      expect(result.current.stageCues).toHaveLength(1);
      expect(result.current.stageCue?.text).toBe("UPDATED");

      await act(async () => {
        ws.triggerMessage({
          type: "stage_cue",
          id: CUE_ID_B,
          text: "SECOND",
          ttlMs: 1000,
          sentAtMs: 3,
        });
      });
      expect(result.current.stageCues).toHaveLength(2);

      await act(async () => {
        ws.triggerMessage({
          type: "stage_cue_dismiss",
          id: CUE_ID,
          sentAtMs: 4,
        });
      });
      expect(result.current.stageCues).toHaveLength(1);
      expect(result.current.stageCue?.id).toBe(CUE_ID_B);

      await act(async () => {
        ws.triggerMessage({
          type: "stage_cue_dismiss",
          clearAll: true,
          sentAtMs: 5,
        });
      });
      expect(result.current.stageCues).toEqual([]);
      expect(result.current.stageCue).toBeNull();
    });

    it("ignores stage_cue_dismiss without id or clearAll", async () => {
      const { result } = await mountProvider();
      const ws = await openLatestWs();

      await act(async () => {
        ws.triggerMessage({
          type: "stage_cue",
          text: "KEEP",
          ttlMs: 1000,
          sentAtMs: 1,
        });
        ws.triggerMessage({
          type: "stage_cue_dismiss",
          sentAtMs: 2,
        });
      });

      expect(result.current.stageCues).toHaveLength(1);
      expect(result.current.stageCue?.text).toBe("KEEP");
    });

    it("updates liveDesk from WS", async () => {
      const { result } = await mountProvider();
      const ws = await openLatestWs();

      await act(async () => {
        ws.triggerMessage({
          type: "live_desk",
          transpositionSemitones: -3,
          syncLeadMs: 250,
          clientEditEnabled: true,
          sentAtMs: 9,
        });
      });

      expect(result.current.liveDesk).toEqual({
        transpositionSemitones: -3,
        syncLeadMs: 250,
        clientEditEnabled: true,
      });
    });

    it("sets error on invalid JSON", async () => {
      const { result } = await mountProvider();
      const ws = await openLatestWs();

      await act(async () => {
        ws.triggerMessage("{not-json");
      });

      expect(result.current.error).toMatch(/JSON|Unexpected|property name/i);
    });

    it("sets error only for malformed transport_tick frames", async () => {
      const { result } = await mountProvider();
      const ws = await openLatestWs();

      await act(async () => {
        ws.triggerMessage({ type: "unknown_frame", foo: 1 });
      });
      expect(result.current.error).toBeNull();

      await act(async () => {
        ws.triggerMessage({ type: "transport_tick", playing: "nope" });
      });
      expect(result.current.error).toMatch(/Expected boolean|invalid_type/i);
    });

    it("stops rAF when tick says not playing", async () => {
      const { result } = await mountProvider();
      const ws = await openLatestWs();

      await act(async () => {
        ws.triggerMessage(tickPayload({ playing: true, serverTimeMs: 1 }));
      });
      const pending = rafQueue.length;
      expect(pending).toBeGreaterThan(0);

      await act(async () => {
        ws.triggerMessage(
          tickPayload({ playing: false, positionTicks: 10, serverTimeMs: 2 }),
        );
      });
      rafQueue.length = 0;
      await act(async () => {
        flushRaf(50);
      });
      expect(result.current.state.playing).toBe(false);
    });

    it("rAF loop exits cleanly when playingRef flips before frame", async () => {
      vi.stubGlobal("cancelAnimationFrame", () => {
        /* leave queued frames so loop can observe !playing */
      });
      const { result } = await mountProvider();
      const ws = await openLatestWs();

      await act(async () => {
        ws.triggerMessage(
          tickPayload({ playing: true, positionTicks: 0, serverTimeMs: 1 }),
        );
      });
      expect(rafQueue.length).toBeGreaterThan(0);

      await act(async () => {
        ws.triggerMessage(
          tickPayload({ playing: false, positionTicks: 0, serverTimeMs: 2 }),
        );
      });
      await act(async () => {
        flushRaf(30);
      });
      expect(result.current.state.playing).toBe(false);
    });

    it("ignores malformed non-object JSON without setting tick error", async () => {
      const { result } = await mountProvider();
      const ws = await openLatestWs();

      await act(async () => {
        ws.triggerMessage("42");
      });
      expect(result.current.error).toBeNull();
    });
  });

  describe("welcome WS tick (no on-open HTTP)", () => {
    it("starts rAF from welcome tick when playing", async () => {
      getTransport.mockResolvedValueOnce(snap());

      const { result } = await mountProvider();
      const ws = await openLatestWs();
      expect(getTransport).toHaveBeenCalledTimes(1);

      await act(async () => {
        ws.triggerMessage({
          type: "transport_tick",
          ...snap({ playing: true, positionTicks: 50 }, 3).state,
          serverTimeMs: 3,
          sentAtMs: Date.now(),
        });
      });

      expect(result.current.state.playing).toBe(true);
      expect(result.current.state.positionTicks).toBe(50);
      expect(rafQueue.length).toBeGreaterThan(0);
    });
  });
});
