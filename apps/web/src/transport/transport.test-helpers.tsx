import { act, renderHook } from "@testing-library/react";
import { defaultTransportState, type TransportState } from "@stagesync/shared";
import type { ReactNode } from "react";
import { expect, vi } from "vitest";
import { TransportProvider } from "./TransportProvider.js";
import { useTransport } from "./useTransport.js";

export const CUE_ID = "00000000-0000-4000-8000-000000000001";
export const CUE_ID_B = "00000000-0000-4000-8000-000000000002";

export type MockWs = {
  url: string;
  readyState: number;
  onopen: ((ev: Event) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  triggerOpen: () => void;
  triggerMessage: (data: unknown) => void;
  triggerClose: () => void;
  triggerError: () => void;
};

export class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWs[] = [];

  url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
  });

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  triggerOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  triggerMessage(data: unknown) {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    this.onmessage?.(new MessageEvent("message", { data: payload }));
  }

  triggerClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent("close"));
  }

  triggerError() {
    this.onerror?.(new Event("error"));
  }
}

export const rafQueue: FrameRequestCallback[] = [];
export let nextRafId = 1;
export const cancelledRaf = new Set<number>();

export function resetRafQueue() {
  rafQueue.length = 0;
  nextRafId = 1;
  cancelledRaf.clear();
}

export function flushRaf(frameTime = 16) {
  const batch = rafQueue.splice(0);
  for (const cb of batch) {
    cb(frameTime);
  }
}

export function setupRafMock() {
  vi.stubGlobal("WebSocket", MockWebSocket);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = nextRafId++;
    rafQueue.push((t) => {
      if (!cancelledRaf.has(id)) cb(t);
    });
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    cancelledRaf.add(id);
  });
}

export function wrapper({ children }: { children: ReactNode }) {
  return <TransportProvider>{children}</TransportProvider>;
}

export function snap(
  overrides: Partial<TransportState> = {},
  serverTimeMs = 1,
): { state: TransportState; serverTimeMs: number } {
  return {
    state: { ...defaultTransportState(), ...overrides },
    serverTimeMs,
  };
}

export function tickPayload(
  overrides: Partial<TransportState> & {
    serverTimeMs?: number;
    sentAtMs?: number;
  } = {},
) {
  const { serverTimeMs = 10, sentAtMs, ...state } = overrides;
  return {
    ...defaultTransportState(),
    ...state,
    type: "transport_tick" as const,
    serverTimeMs,
    ...(sentAtMs !== undefined ? { sentAtMs } : {}),
  };
}

export async function flushMicrotasks(times = 4) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

export async function mountProvider() {
  const utils = renderHook(() => useTransport(), { wrapper });
  await flushMicrotasks();
  return utils;
}

export async function openLatestWs() {
  const ws = MockWebSocket.instances.at(-1);
  expect(ws).toBeDefined();
  await act(async () => {
    ws!.triggerOpen();
  });
  await flushMicrotasks();
  return ws!;
}
