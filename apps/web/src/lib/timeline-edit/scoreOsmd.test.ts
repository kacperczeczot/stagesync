/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { OpenSheetMusicDisplayMock, PointF2DMock, renderSpy, updateGraphicSpy } =
  vi.hoisted(() => {
    const renderSpy = vi.fn();
    const updateGraphicSpy = vi.fn();

    class PointF2DMock {
      constructor(
        public x: number,
        public y: number,
      ) {}
    }

    class OpenSheetMusicDisplayMock {
      EngravingRules = {
        PageBackgroundColor: "",
        RestoreCursorAfterRerender: true,
      };
      Zoom = 1;
      TransposeCalculator: unknown = null;
      Sheet: {
        SourceMeasures?: unknown[];
        Instruments?: unknown[];
        Transpose?: number;
      } | null = null;
      GraphicSheet: {
        MeasureList?: unknown;
        GetNearestNote?: (
          pos: PointF2DMock,
          max: PointF2DMock,
        ) => {
          sourceNote?: { SourceMeasure?: { MeasureNumber?: number } };
        } | null;
      } | null = null;
      cursors: Array<{
        reset: () => void;
        show: () => void;
        nextMeasure: () => void;
        update: () => void;
        adjustToBackgroundColor?: () => void;
        cursorElement?: HTMLElement | null;
        iterator?: unknown;
        Iterator?: unknown;
        Hidden?: boolean;
      }> = [];
      cursor: unknown;
      constructor(
        public container: HTMLElement,
        public options: unknown,
      ) {}
      IsReadyToRender = vi.fn(() => false);
      render = renderSpy;
      updateGraphic = updateGraphicSpy;
    }

    return {
      OpenSheetMusicDisplayMock,
      PointF2DMock,
      renderSpy,
      updateGraphicSpy,
    };
  });

vi.mock("opensheetmusicdisplay", () => ({
  OpenSheetMusicDisplay: OpenSheetMusicDisplayMock,
  PointF2D: PointF2DMock,
  TransposeCalculator: class TransposeCalculator {},
}));

import {
  applyOsmdZoom,
  clampScoreBar,
  createOsmd,
  getMeasureCount,
  goToScoreBar,
  readOsmdCssHex,
  renderOsmd,
  scrollCursorIntoView,
} from "./scoreOsmd.js";

function makeOsmd() {
  return createOsmd(document.createElement("div")) as unknown as InstanceType<
    typeof OpenSheetMusicDisplayMock
  >;
}

describe("scoreOsmd", () => {
  const memory = new Map<string, string>();

  beforeEach(() => {
    renderSpy.mockClear();
    updateGraphicSpy.mockClear();
    memory.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memory.set(k, String(v));
      },
      removeItem: (k: string) => {
        memory.delete(k);
      },
      clear: () => memory.clear(),
      key: () => null,
      length: 0,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("createOsmd / renderOsmd", () => {
    it("constructs OSMD with cursor options and engraving flags", () => {
      const el = document.createElement("div");
      const osmd = createOsmd(el) as unknown as InstanceType<
        typeof OpenSheetMusicDisplayMock
      >;
      expect(osmd.container).toBe(el);
      expect(osmd.EngravingRules.PageBackgroundColor).toBe("#ffffff");
      expect(osmd.EngravingRules.RestoreCursorAfterRerender).toBe(false);
      expect(osmd.TransposeCalculator).toBeTruthy();
      expect(osmd.options).toMatchObject({
        backend: "svg",
        followCursor: false,
        cursorsOptions: [
          { type: 1, color: "#22d3ee", alpha: 0.85, follow: false },
          { type: 3, color: "#fbbf24", alpha: 0.45, follow: false },
        ],
      });
    });

    it("reads cursor / paper colors from --ss-* when set on :root", () => {
      document.documentElement.style.setProperty(
        "--ss-color-primary",
        "#aabbcc",
      );
      document.documentElement.style.setProperty(
        "--ss-color-focus-ring",
        "#112233",
      );
      document.documentElement.style.setProperty(
        "--ss-color-osmd-paper",
        "#fefefe",
      );
      const el = document.createElement("div");
      document.body.appendChild(el);
      const osmd = createOsmd(el) as unknown as InstanceType<
        typeof OpenSheetMusicDisplayMock
      >;
      expect(osmd.EngravingRules.PageBackgroundColor).toBe("#fefefe");
      expect(osmd.options).toMatchObject({
        cursorsOptions: [
          { type: 1, color: "#112233" },
          { type: 3, color: "#aabbcc" },
        ],
      });
      el.remove();
      document.documentElement.style.removeProperty("--ss-color-primary");
      document.documentElement.style.removeProperty("--ss-color-focus-ring");
      document.documentElement.style.removeProperty("--ss-color-osmd-paper");
    });

    it("readOsmdCssHex falls back for non-hex or missing vars", () => {
      expect(readOsmdCssHex("--ss-missing-token", "#abcdef")).toBe("#abcdef");
      document.documentElement.style.setProperty("--ss-bad", "rgb(1,2,3)");
      expect(readOsmdCssHex("--ss-bad", "#010203")).toBe("#010203");
      document.documentElement.style.removeProperty("--ss-bad");
    });

    it("renderOsmd no-ops until ready, then renders", () => {
      const osmd = makeOsmd();
      renderOsmd(osmd as never);
      expect(renderSpy).not.toHaveBeenCalled();
      osmd.IsReadyToRender.mockReturnValue(true);
      renderOsmd(osmd as never);
      expect(renderSpy).toHaveBeenCalledOnce();
    });
  });

  describe("measure helpers", () => {
    it("getMeasureCount prefers SourceMeasures then MeasureList", () => {
      const osmd = makeOsmd();
      expect(getMeasureCount(osmd as never)).toBe(1);
      osmd.Sheet = { SourceMeasures: [{}, {}, {}] };
      expect(getMeasureCount(osmd as never)).toBe(3);
      osmd.Sheet = null;
      osmd.GraphicSheet = { MeasureList: [{}, {}] };
      expect(getMeasureCount(osmd as never)).toBe(2);
    });

    it("clampScoreBar floors and clamps to measure range", () => {
      const osmd = makeOsmd();
      osmd.Sheet = { SourceMeasures: [{}, {}, {}, {}] };
      expect(clampScoreBar(osmd as never, 0)).toBe(1);
      expect(clampScoreBar(osmd as never, 2.9)).toBe(2);
      expect(clampScoreBar(osmd as never, 99)).toBe(4);
    });
  });

  describe("goToScoreBar / zoom / scroll", () => {
    it("goToScoreBar advances measure cursor and styles element", () => {
      const cursorEl = document.createElement("div");
      const nextMeasure = vi.fn();
      let measureIndex = 0;
      const osmd = makeOsmd();
      osmd.Sheet = { SourceMeasures: [{}, {}, {}, {}] };
      const iterator = {
        get CurrentMeasureIndex() {
          return measureIndex;
        },
        EndReached: false,
      };
      osmd.cursors = [
        {
          reset: vi.fn(() => {
            measureIndex = 0;
          }),
          show: vi.fn(),
          nextMeasure: () => {
            nextMeasure();
            measureIndex += 1;
          },
          update: vi.fn(),
          adjustToBackgroundColor: vi.fn(),
          cursorElement: cursorEl,
          iterator,
        },
      ];

      goToScoreBar(osmd as never, 3);
      expect(nextMeasure).toHaveBeenCalledTimes(2);
      expect(measureIndex).toBe(2);
      expect(cursorEl.style.pointerEvents).toBe("none");
      expect(cursorEl.style.zIndex).toBe("5");
    });

    it("goToScoreBar skips reset when advancing forward from current measure", () => {
      const nextMeasure = vi.fn();
      let measureIndex = 1;
      const reset = vi.fn(() => {
        measureIndex = 0;
      });
      const osmd = makeOsmd();
      osmd.Sheet = { SourceMeasures: [{}, {}, {}, {}] };
      const iterator = {
        get CurrentMeasureIndex() {
          return measureIndex;
        },
        EndReached: false,
      };
      osmd.cursors = [
        {
          reset,
          show: vi.fn(),
          nextMeasure: () => {
            nextMeasure();
            measureIndex += 1;
          },
          update: vi.fn(),
          adjustToBackgroundColor: vi.fn(),
          cursorElement: document.createElement("div"),
          iterator,
        },
      ];

      goToScoreBar(osmd as never, 3);
      expect(reset).not.toHaveBeenCalled();
      expect(nextMeasure).toHaveBeenCalledTimes(1);
      expect(measureIndex).toBe(2);
    });

    it("goToScoreBar no-ops walk when already on target measure", () => {
      const nextMeasure = vi.fn();
      const reset = vi.fn();
      const osmd = makeOsmd();
      osmd.Sheet = { SourceMeasures: [{}, {}, {}] };
      osmd.cursors = [
        {
          reset,
          show: vi.fn(),
          nextMeasure,
          update: vi.fn(),
          adjustToBackgroundColor: vi.fn(),
          cursorElement: document.createElement("div"),
          iterator: { CurrentMeasureIndex: 1, EndReached: false },
        },
      ];

      goToScoreBar(osmd as never, 2);
      expect(reset).not.toHaveBeenCalled();
      expect(nextMeasure).not.toHaveBeenCalled();
    });

    it("goToScoreBar follows CurrentMeasureIndex across repeat jumps (not step count)", () => {
      const nextMeasure = vi.fn();
      // Sheet indices 0..3; musical path jumps back after index 2 (volta-like).
      const path = [0, 1, 2, 0, 1, 2, 3];
      let pathPos = 0;
      const osmd = makeOsmd();
      osmd.Sheet = { SourceMeasures: [{}, {}, {}, {}] };
      const iterator = {
        get CurrentMeasureIndex() {
          return path[pathPos] ?? 3;
        },
        get EndReached() {
          return pathPos >= path.length - 1 && path[pathPos] === 3;
        },
      };
      osmd.cursors = [
        {
          reset: vi.fn(() => {
            pathPos = 0;
          }),
          show: vi.fn(),
          nextMeasure: () => {
            nextMeasure();
            if (pathPos < path.length - 1) pathPos += 1;
          },
          update: vi.fn(),
          adjustToBackgroundColor: vi.fn(),
          cursorElement: document.createElement("div"),
          Iterator: iterator,
        },
      ];

      goToScoreBar(osmd as never, 4);
      // Counting nextMeasure would stop after 3 steps at sheet index 0 (post-jump).
      // Index-based navigation continues through the second pass to index 3.
      expect(nextMeasure.mock.calls.length).toBeGreaterThan(3);
      expect(path[pathPos]).toBe(3);
    });

    it("goToScoreBar stops on EndReached / safety cap without infinite loop", () => {
      const nextMeasure = vi.fn();
      const osmd = makeOsmd();
      osmd.Sheet = { SourceMeasures: [{}, {}, {}] };
      const iterator = {
        CurrentMeasureIndex: 0,
        EndReached: false,
      };
      osmd.cursors = [
        {
          reset: vi.fn(),
          show: vi.fn(),
          nextMeasure: () => {
            nextMeasure();
            // Stuck at index 0 (pathological) — safety cap must stop the loop.
          },
          update: vi.fn(),
          adjustToBackgroundColor: vi.fn(),
          cursorElement: document.createElement("div"),
          iterator,
        },
      ];

      expect(() => goToScoreBar(osmd as never, 3)).not.toThrow();
      expect(nextMeasure.mock.calls.length).toBeGreaterThan(0);
      expect(nextMeasure.mock.calls.length).toBeLessThanOrEqual(
        Math.max(3 * 8, 64),
      );
    });

    it("goToScoreBar no-ops without cursors", () => {
      const osmd = makeOsmd();
      osmd.cursors = [];
      expect(() => goToScoreBar(osmd as never, 2)).not.toThrow();
    });

    it("applyOsmdZoom clamps and re-renders when ready", () => {
      const osmd = makeOsmd();
      applyOsmdZoom(osmd as never, 10);
      expect(osmd.Zoom).toBe(0.4);
      osmd.IsReadyToRender.mockReturnValue(true);
      applyOsmdZoom(osmd as never, 300);
      expect(osmd.Zoom).toBe(2.5);
      expect(renderSpy).toHaveBeenCalled();
    });

    it("scrollCursorIntoView scrolls toward cursor", () => {
      const cursorEl = document.createElement("div");
      cursorEl.getBoundingClientRect = () =>
        ({
          top: 200,
          left: 0,
          bottom: 220,
          right: 10,
          width: 10,
          height: 20,
          x: 0,
          y: 200,
          toJSON() {},
        }) as DOMRect;
      const scrollEl = document.createElement("div");
      scrollEl.scrollTop = 0;
      scrollEl.getBoundingClientRect = () =>
        ({
          top: 0,
          left: 0,
          bottom: 100,
          right: 100,
          width: 100,
          height: 100,
          x: 0,
          y: 0,
          toJSON() {},
        }) as DOMRect;
      const scrollTo = vi.fn();
      scrollEl.scrollTo = scrollTo as never;

      const osmd = makeOsmd();
      osmd.cursors = [
        {
          reset: vi.fn(),
          show: vi.fn(),
          nextMeasure: vi.fn(),
          update: vi.fn(),
          cursorElement: cursorEl,
        },
      ];

      scrollCursorIntoView(scrollEl, osmd as never);
      expect(scrollTo).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: "smooth" }),
      );
    });
  });
});
