import { vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTimelineFormaGestures } from "./useTimelineFormaGestures.js";
import {
  EMPTY_CLIP_SELECTION,
  type ClipSelection,
  type ClipSelectionLane,
} from "@lib/timeline/timelineSelection.js";
import type { ToolId } from "../timelineToolsData.js";
import type { Project } from "@stagesync/shared";

// ---------------------------------------------------------------------------
// Project factory
// ---------------------------------------------------------------------------
export function createTestProject(): Project {
  return {
    id: "p1",
    name: "Forma Gestures Test",
    formatVersion: 6,
    updatedAt: new Date().toISOString(),
    ppq: 960,
    defaultBpm: 120,
    defaultMeter: { numerator: 4, denominator: 4 },
    forma: {
      clips: [
        {
          id: "c0",
          name: "Count",
          kind: "countdown",
          startTicks: 0,
          lengthTicks: 960,
        },
        {
          id: "c1",
          name: "Verse",
          kind: "section",
          startTicks: 960,
          lengthTicks: 15360,
          subsections: [3840],
        },
        {
          id: "c2",
          name: "Chorus",
          kind: "section",
          startTicks: 16320,
          lengthTicks: 15360,
        },
      ],
    },
    akordy: {
      clips: [{ id: "ak1", symbol: "Cmaj7", startTicks: 0, lengthTicks: 7680 }],
    },
    tekst: {
      clips: [
        {
          id: "t1",
          text: "Lyrics line",
          startTicks: 960,
          lengthTicks: 7680,
          blocks: [
            {
              id: "tb1",
              startTicks: 0,
              lengthTicks: 7680,
              text: "Lyrics line",
            },
          ],
        },
      ],
    },
    cue: {
      clips: [{ id: "cue1", label: "Cue 1", startTicks: 0, lengthTicks: 7680 }],
    },
    tempoMap: [],
    meterMap: [],
    keyMap: [],
    audioTracks: [
      {
        id: "trk1",
        name: "Backing",
        gainDb: 0,
        pan: 0,
        muted: false,
        channelMode: "stereo",
      },
    ],
    audioClips: [
      {
        id: "ac1",
        trackId: "trk1",
        assetId: "a1",
        startTicks: 960,
        lengthTicks: 15360,
        trimInMs: 0,
        fadeInMs: 100,
        fadeOutMs: 100,
        gainDb: 0,
      },
    ],
    assets: [],
  };
}

// ---------------------------------------------------------------------------
// Pointer event factory
// ---------------------------------------------------------------------------
export function makeEl(width = 200, height = 40): HTMLElement {
  const el = document.createElement("button");
  el.getBoundingClientRect = vi
    .fn()
    .mockReturnValue({ left: 0, top: 0, width, height });
  el.setPointerCapture = vi.fn();
  el.releasePointerCapture = vi.fn();
  el.hasPointerCapture = vi.fn().mockReturnValue(true);
  return el;
}

export function mockPointerEvent<T extends HTMLElement = HTMLElement>(
  overrides: Partial<React.PointerEvent<T>> = {},
  el?: T,
): React.PointerEvent<T> {
  const target = el ?? (makeEl() as unknown as T);
  return {
    button: 0,
    pointerId: 1,
    pointerType: "mouse",
    clientX: 100,
    clientY: 20,
    currentTarget: target,
    target,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  } as unknown as React.PointerEvent<T>;
}

// ---------------------------------------------------------------------------
// Hook factory to reduce boilerplate
// ---------------------------------------------------------------------------
export function buildHook(
  overrides: {
    tool?: ToolId;
    gesturePolicy?: { pencilDraw: boolean; clipDragResize: boolean };
    selectedClipId?: string | null;
    clipSelection?: ClipSelection;
    soloAudioTrackIds?: string[];
    rawTicksAtClientX?: (x: number) => number | null;
    commitDraft?: (p: Project) => void;
    setClipSelection?: React.Dispatch<React.SetStateAction<ClipSelection>>;
    selectLaneClip?: (lane: ClipSelectionLane, id: string) => void;
    setTouchAlertOpen?: (v: boolean) => void;
    beginMarquee?: () => void;
    beginTouchCanvasNav?: () => void;
    deleteSelectedFormaClip?: () => void;
  } = {},
) {
  const draftProject = createTestProject();
  const commitDraft = overrides.commitDraft ?? vi.fn();
  const setClipSelection =
    overrides.setClipSelection ??
    (vi.fn() as unknown as React.Dispatch<React.SetStateAction<ClipSelection>>);
  const selectLaneClip = overrides.selectLaneClip ?? vi.fn();
  const setTouchAlertOpen = overrides.setTouchAlertOpen ?? vi.fn();
  const beginMarquee = overrides.beginMarquee ?? vi.fn();
  const beginTouchCanvasNav = overrides.beginTouchCanvasNav ?? vi.fn();
  const deleteSelectedFormaClip = overrides.deleteSelectedFormaClip ?? vi.fn();

  const { result } = renderHook(() =>
    useTimelineFormaGestures({
      draftRef: { current: draftProject },
      draftProject,
      commitDraft,
      rawTicksAtClientX:
        overrides.rawTicksAtClientX ?? vi.fn().mockReturnValue(7680),
      tool: overrides.tool ?? "pointer",
      gesturePolicy: overrides.gesturePolicy ?? {
        pencilDraw: true,
        clipDragResize: true,
      },
      setTouchAlertOpen,
      clipSelection: overrides.clipSelection ?? EMPTY_CLIP_SELECTION,
      setClipSelection,
      clearClipSelection: vi.fn(),
      selectLaneClip,
      selectedClipId: overrides.selectedClipId ?? null,
      clearMapSelection: vi.fn(),
      setSelectedAnchorId: vi.fn(),
      setSongMetaOpen: vi.fn(),
      setSelectedSubsectionIdx: vi.fn(),
      deleteSelectedFormaClip,
      beginMarquee,
      beginTouchCanvasNav,
      heldZoomRef: { current: false },
      zoomHRef: { current: 1 },
      effectiveZoomH: 1,
      soloAudioTrackIds: overrides.soloAudioTrackIds ?? [],
      setSoloAudioTrackIds: vi.fn(),
      soloHoldRef: { current: [] },
      setCanvasNotice: vi.fn(),
      canvasNoticeTimerRef: { current: null },
    }),
  );

  return {
    result,
    commitDraft,
    setClipSelection,
    selectLaneClip,
    setTouchAlertOpen,
    beginMarquee,
    beginTouchCanvasNav,
    deleteSelectedFormaClip,
    draftProject,
  };
}
