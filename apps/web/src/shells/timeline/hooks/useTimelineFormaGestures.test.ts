// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { act } from "@testing-library/react";
import type {
  FormaGestureSession,
  FormaGesturePreview,
} from "@lib/timeline/timelineGesture.js";
import { buildHook } from "./useTimelineFormaGestures.test-helpers.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("useTimelineFormaGestures", () => {
  describe("initial state", () => {
    it("starts with null gestureSession and gesturePreview", () => {
      const { result } = buildHook();
      expect(result.current.gestureSession).toBeNull();
      expect(result.current.gesturePreview).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // beginFormaGesture / endFormaGesture (direct API)
  // -------------------------------------------------------------------------
  describe("beginFormaGesture / endFormaGesture", () => {
    it("sets and clears gesture session via begin/end pair", () => {
      const { result } = buildHook();

      const session: FormaGestureSession = {
        kind: "move",
        clipId: "c1",
        lane: "forma",
        pointerId: 1,
        moveIds: ["c1"],
        originClipStart: 960,
        originClipLength: 15360,
        originTicks: 960,
      };
      const preview: FormaGesturePreview = {
        kind: "move",
        clipId: "c1",
        startTicks: 960,
        lengthTicks: 15360,
      };

      act(() => {
        result.current.beginFormaGesture(session, preview);
      });
      expect(result.current.gestureSession?.kind).toBe("move");

      act(() => {
        result.current.endFormaGesture(false, false);
      });
      expect(result.current.gestureSession).toBeNull();
    });

    it("commits forma move gesture on endFormaGesture", () => {
      const { result, commitDraft } = buildHook();
      const session: FormaGestureSession = {
        kind: "move",
        clipId: "c1",
        lane: "forma",
        pointerId: 1,
        moveIds: ["c1"],
        originClipStart: 960,
        originClipLength: 15360,
        originTicks: 960,
      };
      const preview: FormaGesturePreview = {
        kind: "move",
        clipId: "c1",
        startTicks: 3840,
        lengthTicks: 15360,
      };

      act(() => {
        result.current.beginFormaGesture(session, preview);
      });
      act(() => {
        result.current.endFormaGesture(false, false);
      });

      expect(commitDraft).toHaveBeenCalled();
    });

    it("commits content move gesture (tekst lane)", () => {
      const { result, commitDraft } = buildHook();
      const session: FormaGestureSession = {
        kind: "move",
        clipId: "t1",
        lane: "tekst",
        pointerId: 1,
        moveIds: ["t1"],
        originClipStart: 960,
        originClipLength: 7680,
        originTicks: 960,
      };
      const preview: FormaGesturePreview = {
        kind: "move",
        clipId: "t1",
        startTicks: 3840,
        lengthTicks: 7680,
      };

      act(() => {
        result.current.beginFormaGesture(session, preview);
      });
      act(() => {
        result.current.endFormaGesture(false, false);
      });

      expect(commitDraft).toHaveBeenCalled();
    });

    it("commits audio gesture (audio lane)", () => {
      const { result, commitDraft } = buildHook();
      const session: FormaGestureSession = {
        kind: "move",
        clipId: "ac1",
        lane: "audio:trk1",
        pointerId: 1,
        moveIds: ["ac1"],
        originClipStart: 960,
        originClipLength: 15360,
        originTicks: 960,
      };
      const preview: FormaGesturePreview = {
        kind: "move",
        clipId: "ac1",
        startTicks: 3840,
        lengthTicks: 15360,
      };

      act(() => {
        result.current.beginFormaGesture(session, preview);
      });
      act(() => {
        result.current.endFormaGesture(false, false);
      });

      expect(commitDraft).toHaveBeenCalled();
    });

    it("handles optionCopy gesture on forma (Alt+drag copy)", () => {
      const { result, commitDraft } = buildHook();
      const session: FormaGestureSession = {
        kind: "move",
        clipId: "c1",
        lane: "forma",
        pointerId: 1,
        optionCopy: true,
        moveIds: ["c1"],
        originClipStart: 960,
        originClipLength: 15360,
        originTicks: 960,
      };
      const preview: FormaGesturePreview = {
        kind: "move",
        clipId: "c1",
        startTicks: 20160,
        lengthTicks: 15360,
      };

      act(() => {
        result.current.beginFormaGesture(session, preview);
      });
      act(() => {
        result.current.endFormaGesture(false, false);
      });

      expect(commitDraft).toHaveBeenCalled();
    });

    it("handles optionCopy gesture on tekst lane (Alt+drag copy)", () => {
      const { result, commitDraft } = buildHook();
      const session: FormaGestureSession = {
        kind: "move",
        clipId: "t1",
        lane: "tekst",
        pointerId: 1,
        optionCopy: true,
        moveIds: ["t1"],
        originClipStart: 960,
        originClipLength: 7680,
        originTicks: 960,
      };
      const preview: FormaGesturePreview = {
        kind: "move",
        clipId: "t1",
        startTicks: 10000,
        lengthTicks: 7680,
      };

      act(() => {
        result.current.beginFormaGesture(session, preview);
      });
      act(() => {
        result.current.endFormaGesture(false, false);
      });

      expect(commitDraft).toHaveBeenCalled();
    });

    it("does nothing when no session set on endFormaGesture", () => {
      const { result, commitDraft } = buildHook();
      act(() => {
        result.current.endFormaGesture(false, false);
      });
      expect(commitDraft).not.toHaveBeenCalled();
    });
  });
});
