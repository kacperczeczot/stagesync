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
  applyScorePartVisibility,
  applyScoreSheetTranspose,
  clampScoreOctave,
  createOsmd,
  fetchScoreBlob,
  listScoreParts,
  loadScoreHiddenParts,
  loadScoreOctave,
  saveScoreHiddenParts,
  saveScoreOctave,
  scoreBarFromClientPoint,
  scoreInstrumentId,
  scoreOctaveToSemitones,
  scoreSheetTransposeSemitones,
} from "./scoreOsmd.js";

function makeOsmd() {
  return createOsmd(document.createElement("div")) as unknown as InstanceType<
    typeof OpenSheetMusicDisplayMock
  >;
}

describe("scoreOsmd parts, prefs, and client hit-test", () => {
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

  describe("scoreBarFromClientPoint", () => {
    it("returns null without GraphicSheet", () => {
      const osmd = makeOsmd();
      const container = document.createElement("div");
      expect(
        scoreBarFromClientPoint(osmd as never, container, 0, 0),
      ).toBeNull();
    });

    it("uses GetNearestNote when available", () => {
      const osmd = makeOsmd();
      osmd.Zoom = 1;
      osmd.GraphicSheet = {
        GetNearestNote: () => ({
          sourceNote: { SourceMeasure: { MeasureNumber: 7 } },
        }),
        MeasureList: [],
      };
      const container = document.createElement("div");
      container.getBoundingClientRect = () =>
        ({
          left: 0,
          top: 0,
          right: 100,
          bottom: 100,
          width: 100,
          height: 100,
          x: 0,
          y: 0,
          toJSON() {},
        }) as DOMRect;
      expect(scoreBarFromClientPoint(osmd as never, container, 10, 10)).toBe(7);
    });

    it("falls back to MeasureList hit-test / nearest", () => {
      const osmd = makeOsmd();
      osmd.Zoom = 1;
      osmd.GraphicSheet = {
        GetNearestNote: () => {
          throw new Error("no note");
        },
        MeasureList: [
          [
            {
              MeasureNumber: 2,
              PositionAndShape: {
                AbsolutePosition: { x: 1, y: 1 },
                Size: { width: 2, height: 2 },
              },
            },
          ],
          [
            {
              MeasureNumber: 3,
              PositionAndShape: {
                AbsolutePosition: { x: 20, y: 20 },
                Size: { width: 1, height: 1 },
              },
            },
          ],
        ],
      };
      const container = document.createElement("div");
      container.getBoundingClientRect = () =>
        ({
          left: 0,
          top: 0,
          right: 400,
          bottom: 400,
          width: 400,
          height: 400,
          x: 0,
          y: 0,
          toJSON() {},
        }) as DOMRect;
      // scale = 10; measure 2 box: left=10, top=10, right=30, bottom=30
      expect(scoreBarFromClientPoint(osmd as never, container, 15, 15)).toBe(2);
      // outside → nearest
      expect(scoreBarFromClientPoint(osmd as never, container, 5, 5)).toBe(2);
    });
  });

  describe("parts / transpose", () => {
    it("listScoreParts maps instruments", () => {
      const osmd = makeOsmd();
      expect(listScoreParts(osmd as never)).toEqual([]);
      osmd.Sheet = {
        Instruments: [
          { Name: "Piano", IdString: "P1" },
          { PartAbbreviation: "Vl" },
        ],
      };
      expect(listScoreParts(osmd as never)).toEqual([
        { id: "P1::0", label: "Piano", index: 0 },
        { id: "Vl::1", label: "Vl", index: 1 },
      ]);
    });

    it("applyScorePartVisibility keeps at least one part visible", () => {
      const osmd = makeOsmd();
      const voices = [{ Visible: true }];
      osmd.Sheet = {
        Instruments: [
          { Name: "A", IdString: "A", Voices: voices },
          { Name: "B", IdString: "B", Voices: [{ Visible: true }] },
        ],
      };
      applyScorePartVisibility(osmd as never, ["A::0", "B::1"]);
      expect(
        (osmd.Sheet!.Instruments![0] as { Visible: boolean }).Visible,
      ).toBe(true);
      expect(
        (osmd.Sheet!.Instruments![1] as { Visible: boolean }).Visible,
      ).toBe(false);
    });

    it("applyScoreSheetTranspose updates and renders", () => {
      const osmd = makeOsmd();
      applyScoreSheetTranspose(osmd as never, 12);
      osmd.Sheet = { Transpose: 0 };
      osmd.IsReadyToRender.mockReturnValue(true);
      applyScoreSheetTranspose(osmd as never, 12);
      expect(osmd.Sheet.Transpose).toBe(12);
      expect(updateGraphicSpy).toHaveBeenCalled();
      expect(renderSpy).toHaveBeenCalled();

      applyScoreSheetTranspose(osmd as never, 12);
      expect(renderSpy).toHaveBeenCalledTimes(2);
    });

    it("applyScoreSheetTranspose installs TransposeCalculator when missing", () => {
      const osmd = makeOsmd();
      osmd.TransposeCalculator = null;
      osmd.Sheet = { Transpose: 2 };
      osmd.IsReadyToRender.mockReturnValue(true);
      updateGraphicSpy.mockClear();
      applyScoreSheetTranspose(osmd as never, 2);
      expect(osmd.TransposeCalculator).toBeTruthy();
      expect(osmd.Sheet.Transpose).toBe(2);
      expect(updateGraphicSpy).toHaveBeenCalled();
    });

    it("scoreSheetTransposeSemitones combines team, pitch, and octave", () => {
      expect(
        scoreSheetTransposeSemitones({
          teamSemitones: 2,
          instrumentPitch: "bb",
          scoreOctave: 1,
        }),
      ).toBe(2 + 2 + 12);
      expect(
        scoreSheetTransposeSemitones({
          teamSemitones: -1,
          instrumentPitch: "manual",
          instrumentPitchManual: 3,
          scoreOctave: -1,
        }),
      ).toBe(-1 + 3 - 12);
      expect(scoreSheetTransposeSemitones({})).toBe(0);
    });

    it("applyScoreSheetTranspose tolerates updateGraphic failure", () => {
      const osmd = makeOsmd();
      osmd.Sheet = { Transpose: 0 };
      osmd.IsReadyToRender.mockReturnValue(false);
      updateGraphicSpy.mockImplementationOnce(() => {
        throw new Error("old osmd");
      });
      expect(() => applyScoreSheetTranspose(osmd as never, 5)).not.toThrow();
      expect(osmd.Sheet.Transpose).toBe(5);
    });
  });

  describe("localStorage prefs", () => {
    it("round-trips hidden parts and octave", () => {
      expect(loadScoreHiddenParts("p1")).toEqual([]);
      saveScoreHiddenParts("p1", ["A::0"]);
      expect(loadScoreHiddenParts("p1")).toEqual(["A::0"]);
      expect(loadScoreHiddenParts("p2")).toEqual([]);

      expect(loadScoreOctave("p1")).toBe(0);
      saveScoreOctave("p1", 1);
      expect(loadScoreOctave("p1")).toBe(1);
      expect(clampScoreOctave("x")).toBe(0);
      expect(scoreOctaveToSemitones(1)).toBe(12);
      expect(scoreInstrumentId({}, 3)).toBe("part::3");
    });

    it("returns defaults on corrupt storage", () => {
      memory.set("stagesync-score-hidden-parts", "{");
      memory.set("stagesync-score-octave", "{");
      expect(loadScoreHiddenParts("p1")).toEqual([]);
      expect(loadScoreOctave("p1")).toBe(0);
    });
  });

  describe("fetchScoreBlob", () => {
    it("returns blob bytes and throws on HTTP error", async () => {
      const blob = new Blob([new Uint8Array([1, 2])]);
      const ok = await fetchScoreBlob(
        "/x",
        async () =>
          ({
            ok: true,
            status: 200,
            blob: async () => blob,
          }) as Response,
      );
      expect(ok).toBe(blob);
      await expect(
        fetchScoreBlob(
          "/x",
          async () =>
            ({
              ok: false,
              status: 500,
              blob: async () => blob,
            }) as Response,
        ),
      ).rejects.toThrow(/HTTP 500/);
    });
  });
});
