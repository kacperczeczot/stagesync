/**
 * @vitest-environment jsdom
 */
import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TransportState } from "@stagesync/shared";

const {
  getTransport,
  playTransport,
  pauseTransport,
  stopTransport,
  seekTransport,
  setTransportLoop,
  fetchLiveDesk,
  wsReconnectDelayMs,
} = vi.hoisted(() => ({
  getTransport: vi.fn(),
  playTransport: vi.fn(),
  pauseTransport: vi.fn(),
  stopTransport: vi.fn(),
  seekTransport: vi.fn(),
  setTransportLoop: vi.fn(),
  fetchLiveDesk: vi.fn(),
  wsReconnectDelayMs: vi.fn(() => 1000),
}));

vi.mock("./api.js", () => ({
  getTransport,
  playTransport,
  pauseTransport,
  stopTransport,
  seekTransport,
  setTransportLoop,
}));

vi.mock("@lib/shell-operator/setlistApi.js", () => ({
  fetchLiveDesk,
}));

vi.mock("./wsReconnect.js", () => ({
  wsReconnectDelayMs,
}));

import {
  flushMicrotasks,
  MockWebSocket,
  mountProvider,
  openLatestWs,
  rafQueue,
  resetRafQueue,
  setupRafMock,
  snap,
  tickPayload,
} from "./transport.test-helpers.js";

describe("TransportProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    resetRafQueue();
    setupRafMock();

    getTransport.mockReset().mockResolvedValue(snap());
    playTransport.mockReset().mockResolvedValue(snap({ playing: true }));
    pauseTransport.mockReset().mockResolvedValue(snap({ playing: false }));
    stopTransport.mockReset().mockResolvedValue(snap({ positionTicks: 0 }));
    seekTransport.mockReset().mockResolvedValue(snap({ positionTicks: 960 }));
    setTransportLoop.mockReset().mockResolvedValue(
      snap({
        loop: { enabled: true, startTicks: 0, endTicks: 480 },
      }),
    );
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

  describe("mount", () => {
    it("loads transport + live desk then connects WS", async () => {
      const { result } = await mountProvider();

      expect(getTransport).toHaveBeenCalled();
      expect(fetchLiveDesk).toHaveBeenCalled();
      expect(result.current.state.positionTicks).toBe(0);
      expect(result.current.liveDesk).toEqual({
        transpositionSemitones: 2,
        syncLeadMs: 100,
        clientEditEnabled: false,
      });
      expect(result.current.wsStatus).toBe("connecting");
      expect(MockWebSocket.instances).toHaveLength(1);
      expect(MockWebSocket.instances[0]!.url).toContain("/ws/transport");
    });

    it("sets error when initial getTransport rejects", async () => {
      getTransport.mockRejectedValueOnce(new Error("offline"));
      const { result } = await mountProvider();

      expect(result.current.error).toBe("offline");
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it("continues when fetchLiveDesk rejects", async () => {
      fetchLiveDesk.mockRejectedValueOnce(new Error("desk down"));
      const { result } = await mountProvider();

      expect(result.current.error).toBeNull();
      expect(result.current.liveDesk.syncLeadMs).toBe(200);
      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });

  describe("WS lifecycle", () => {
    it("on open: status connected, hello interval; no HTTP refresh", async () => {
      getTransport.mockResolvedValueOnce(snap({ positionTicks: 12 }, 1));

      const { result } = await mountProvider();
      expect(getTransport).toHaveBeenCalledTimes(1);
      const ws = await openLatestWs();

      expect(result.current.wsStatus).toBe("connected");
      // Mount snapshot only — open must not call getTransport (stale REST race).
      expect(getTransport).toHaveBeenCalledTimes(1);
      expect(result.current.state.positionTicks).toBe(12);
      expect(ws.send).not.toHaveBeenCalled();

      await act(async () => {
        result.current.announcePresence({
          displayName: "Op",
          roles: ["grid"],
        });
      });
      expect(ws.send).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(ws.send.mock.calls[0]![0]))).toMatchObject({
        type: "client_hello",
        displayName: "Op",
        roles: ["grid"],
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(ws.send).toHaveBeenCalledTimes(2);
    });

    it("reconnects after close using wsReconnectDelayMs", async () => {
      const { result } = await mountProvider();
      const ws = await openLatestWs();

      await act(async () => {
        ws.triggerClose();
      });

      expect(result.current.wsStatus).toBe("disconnected");
      expect(result.current.stageCues).toEqual([]);
      expect(wsReconnectDelayMs).toHaveBeenCalledWith(0);
      expect(MockWebSocket.instances).toHaveLength(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      await flushMicrotasks();

      expect(MockWebSocket.instances).toHaveLength(2);
      expect(result.current.wsStatus).toBe("connecting");
    });

    it("reconnects immediately when tab becomes visible after close", async () => {
      await mountProvider();
      const ws = await openLatestWs();

      await act(async () => {
        ws.triggerClose();
      });
      expect(MockWebSocket.instances).toHaveLength(1);

      await act(async () => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await flushMicrotasks();

      expect(MockWebSocket.instances).toHaveLength(2);
      expect(wsReconnectDelayMs).toHaveBeenCalled();
    });

    it("onerror is a no-op (reconnect via onclose)", async () => {
      await mountProvider();
      const ws = await openLatestWs();
      await act(async () => {
        ws.triggerError();
      });
      expect(MockWebSocket.instances).toHaveLength(1);
      expect(wsReconnectDelayMs).not.toHaveBeenCalled();
    });

    it("unmount clears timers, rAF and closes socket", async () => {
      const { result, unmount } = await mountProvider();
      const ws = await openLatestWs();

      await act(async () => {
        ws.triggerMessage(tickPayload({ playing: true, positionTicks: 100 }));
      });
      expect(rafQueue.length).toBeGreaterThan(0);

      await act(async () => {
        result.current.announcePresence({ displayName: "A", roles: [] });
      });

      unmount();

      expect(ws.close).toHaveBeenCalled();
      const sendCount = ws.send.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(ws.send).toHaveBeenCalledTimes(sendCount);

      await act(async () => {
        ws.triggerClose();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });

  describe("commands", () => {
    it("play/pause/stop/seek/setLoop call API and clear pending", async () => {
      const { result } = await mountProvider();
      await openLatestWs();

      await act(async () => {
        await result.current.play({});
      });
      expect(playTransport).toHaveBeenCalled();
      expect(result.current.commandPending).toBe(false);
      expect(result.current.state.playing).toBe(true);

      await act(async () => {
        await result.current.pause();
      });
      expect(pauseTransport).toHaveBeenCalled();

      await act(async () => {
        await result.current.stop();
      });
      expect(stopTransport).toHaveBeenCalled();

      await act(async () => {
        await result.current.seek(960);
      });
      expect(seekTransport).toHaveBeenCalledWith(960);
      expect(result.current.state.positionTicks).toBe(960);

      await act(async () => {
        await result.current.setLoop({
          enabled: true,
          startTicks: 0,
          endTicks: 480,
        });
      });
      expect(setTransportLoop).toHaveBeenCalled();
      expect(result.current.state.loop).toEqual({
        enabled: true,
        startTicks: 0,
        endTicks: 480,
      });
    });

    it("blocks overlapping commands while pending", async () => {
      let resolvePlay!: (v: {
        state: TransportState;
        serverTimeMs: number;
      }) => void;
      playTransport.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePlay = resolve;
          }),
      );

      const { result } = await mountProvider();
      await openLatestWs();

      let playDone = false;
      await act(async () => {
        void result.current.play().then(() => {
          playDone = true;
        });
      });
      await flushMicrotasks();
      expect(result.current.commandPending).toBe(true);

      await act(async () => {
        await result.current.pause();
      });
      expect(pauseTransport).not.toHaveBeenCalled();

      await act(async () => {
        resolvePlay(snap({ playing: true }, 7));
      });
      await flushMicrotasks(8);
      expect(playDone).toBe(true);
      expect(result.current.commandPending).toBe(false);
    });

    it("surfaces command errors via formatTransportError", async () => {
      playTransport.mockRejectedValueOnce(new Error("denied"));
      const { result } = await mountProvider();
      await openLatestWs();

      await act(async () => {
        await result.current.play();
      });

      expect(result.current.error).toBe("denied");
      expect(result.current.commandPending).toBe(false);
    });
  });

  describe("presence", () => {
    it("announcePresence stores hello and sends when socket open", async () => {
      const { result } = await mountProvider();

      await act(async () => {
        result.current.announcePresence({
          displayName: "Early",
          roles: ["karaoke"],
        });
      });
      expect(MockWebSocket.instances[0]!.send).not.toHaveBeenCalled();

      const ws = await openLatestWs();
      expect(ws.send).toHaveBeenCalled();
      const hello = JSON.parse(String(ws.send.mock.calls[0]![0]));
      expect(hello).toMatchObject({
        type: "client_hello",
        displayName: "Early",
        roles: ["karaoke"],
        latencyMs: null,
      });
    });

    it("includes latency EMA in later hellos after tick samples", async () => {
      const { result } = await mountProvider();
      const ws = await openLatestWs();

      await act(async () => {
        result.current.announcePresence({
          displayName: "Lat",
          roles: [],
        });
        ws.triggerMessage(
          tickPayload({
            serverTimeMs: 11,
            sentAtMs: Date.now() - 120,
          }),
        );
        result.current.announcePresence({
          displayName: "Lat",
          roles: [],
        });
      });

      const last = JSON.parse(
        String(ws.send.mock.calls[ws.send.mock.calls.length - 1]![0]),
      );
      expect(last.latencyMs).toEqual(expect.any(Number));
      expect(last.latencyMs).toBeGreaterThan(0);
    });
  });
});
