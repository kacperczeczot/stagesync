import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { NavigateFunction } from "react-router";
import { useContextMenu } from "@stagesync/ui";
import { ticksFromPointer } from "@lib/timeline-edit/formaCanvas.js";
import { useTimelineTouchGestures } from "@lib/timeline/useTimelineTouchGestures.js";
import {
  ZOOM_H_MAX as PREFS_ZOOM_H_MAX,
  ZOOM_H_MIN as PREFS_ZOOM_H_MIN,
} from "@lib/timeline/timelineZoomPrefs.js";
import { openPreferences } from "@lib/client/preferencesEvents.js";
import type {
  TimelineSurface,
  ClipSelection,
} from "@lib/timeline/timelineSelection.js";
import type { TrackVisibilityMap } from "@lib/timeline/timelineTracks.js";
import type { ToolId } from "../timelineToolsData.js";
import {
  createDefaultTimelineKeyHandlers,
  type TimelineKeyHandlers,
} from "./useTimelineShortcuts.js";
import { useTimelineContextMenus } from "./useTimelineContextMenus.js";
import { useTimelineGestures } from "./useTimelineGestures.js";
import { useTimelineCanvasDerived } from "./useTimelineCanvasDerived.js";
import { useTimelinePlayback } from "./useTimelinePlayback.js";
import { useTimelineAudioState } from "./useTimelineAudioState.js";
import { useTimelineShortcutsAndSync } from "./useTimelineShortcutsAndSync.js";
import { useTimelineAppHeader } from "./useTimelineAppHeader.js";
import type { useTimelineTransportClock } from "./useTimelineTransportClock.js";
import type { useTimelineModals } from "./useTimelineModals.js";
import type { useTimelineDraft } from "./useTimelineDraft.js";
import type { useTimelineFloatingMenus } from "./useTimelineFloatingMenus.js";
import type { useTimelineSelectionState } from "./useTimelineSelectionState.js";
import type { useTimelineDerivedSelection } from "./useTimelineDerivedSelection.js";
import type { useTimelineZoomPan } from "./useTimelineZoomPan.js";
import type { useTimelinePanelState } from "./useTimelinePanelState.js";
import type { useTimelineSetlistState } from "./useTimelineSetlistState.js";
import type { useTimelineMapEdits } from "./useTimelineMapEdits.js";
import type { useTimelineWandTool } from "./useTimelineWandTool.js";

export interface UseTimelineShellInteractionsParams {
  projectId: string | undefined;
  isCompactMobile: boolean;
  showOperatorNav: boolean;
  navigate: NavigateFunction;
  isMobilePreview: boolean;
  gesturePolicy: ReturnType<
    typeof import("@lib/timeline/timelineTouchTier.js").timelineGesturesAllowed
  >;
  tool: ToolId;
  setTool: (tool: ToolId | ((prev: ToolId) => ToolId)) => void;
  toolRef: RefObject<ToolId>;
  setTimelineSurface: Dispatch<SetStateAction<TimelineSurface>>;
  setSongMetaOpen: Dispatch<SetStateAction<boolean>>;
  setInspectorVisible: Dispatch<SetStateAction<boolean>>;
  setTouchAlertOpen: Dispatch<SetStateAction<boolean>>;
  setTrackVisibility: Dispatch<SetStateAction<TrackVisibilityMap>>;
  soloAudioTrackIds: string[];
  setSoloAudioTrackIds: Dispatch<SetStateAction<string[]>>;
  soloBusIds: string[];
  setSoloBusIds: Dispatch<SetStateAction<string[]>>;
  locatorTicks: number;
  setLocatorTicks: Dispatch<SetStateAction<number>>;
  primaryMapId: string | null;
  setPrimaryMapId: Dispatch<SetStateAction<string | null>>;
  tapLineIndex: number;
  setTapLineIndex: Dispatch<SetStateAction<number>>;
  tapLineIndexRef: RefObject<number>;
  lastPointerRef: RefObject<{ x: number; y: number }>;
  soloHoldRef: RefObject<string[] | null>;
  effectiveLocatorTicksRef: RefObject<number>;
  canvasNoticeTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
  setCanvasNotice: (notice: string | null) => void;
  lanesCoordRef: RefObject<HTMLDivElement | null>;
  markerOverlayRef: RefObject<HTMLDivElement | null>;
  canvasScrollRef: RefObject<HTMLDivElement | null>;
  laneAudioFileRef: RefObject<HTMLInputElement | null>;
  laneImportTrackIdRef: RefObject<string | null>;
  laneImportStartTicksRef: RefObject<number | null>;
  viewSpanRef: RefObject<{ start: number; end: number }>;
  barTicksRef: RefObject<number>;
  clipSelectionRef: RefObject<ClipSelection>;
  transport: ReturnType<typeof useTimelineTransportClock>;
  modals: ReturnType<typeof useTimelineModals>;
  draft: ReturnType<typeof useTimelineDraft>;
  floatingMenus: ReturnType<typeof useTimelineFloatingMenus>;
  selection: ReturnType<typeof useTimelineSelectionState>;
  derivedSelection: ReturnType<typeof useTimelineDerivedSelection>;
  zoomPan: ReturnType<typeof useTimelineZoomPan>;
  panelState: ReturnType<typeof useTimelinePanelState>;
  setlistState: ReturnType<typeof useTimelineSetlistState>;
  mapEdits: ReturnType<typeof useTimelineMapEdits>;
  wandTool: ReturnType<typeof useTimelineWandTool>;
}

export function useTimelineShellInteractions(
  params: UseTimelineShellInteractionsParams,
) {
  const {
    projectId,
    isCompactMobile,
    showOperatorNav,
    navigate,
    isMobilePreview,
    gesturePolicy,
    tool,
    setTool,
    toolRef,
    setTimelineSurface,
    setSongMetaOpen,
    setInspectorVisible,
    setTouchAlertOpen,
    setTrackVisibility,
    soloAudioTrackIds,
    setSoloAudioTrackIds,
    soloBusIds,
    setSoloBusIds,
    locatorTicks,
    setLocatorTicks,
    primaryMapId,
    setPrimaryMapId,
    tapLineIndex,
    setTapLineIndex,
    tapLineIndexRef,
    lastPointerRef,
    soloHoldRef,
    effectiveLocatorTicksRef,
    canvasNoticeTimerRef,
    setCanvasNotice,
    lanesCoordRef,
    markerOverlayRef,
    canvasScrollRef,
    laneAudioFileRef,
    laneImportTrackIdRef,
    laneImportStartTicksRef,
    viewSpanRef,
    barTicksRef,
    clipSelectionRef,
    transport,
    modals,
    draft,
    floatingMenus,
    selection,
    derivedSelection,
    zoomPan,
    panelState,
    setlistState,
    mapEdits,
    wandTool,
  } = params;

  const { openAt: openContextMenu, close: closeContextMenu } = useContextMenu();

  const keyHandlersRef = useRef<TimelineKeyHandlers>(
    createDefaultTimelineKeyHandlers(),
  );

  useTimelineTouchGestures({
    enabled: true,
    scrollRef: canvasScrollRef,
    getZoomH: () => zoomPan.zoomHBaseRef.current,
    applyZoomH: (next, anchor) => {
      keyHandlersRef.current.applyAbsoluteZoomH?.(next, anchor);
    },
    onDoubleTap: () => {
      keyHandlersRef.current.fitZoom();
    },
    zoomMin: PREFS_ZOOM_H_MIN,
    zoomMax: PREFS_ZOOM_H_MAX,
  });

  const rawTicksAtClientX = useCallback(
    (clientX: number): number | null => {
      const coordRoot = lanesCoordRef.current;
      if (!coordRoot || !draft.draftRef.current) return null;
      return ticksFromPointer(
        clientX,
        coordRoot,
        viewSpanRef.current,
        barTicksRef.current,
        zoomPan.zoomHRef.current,
      );
    },
    [draft.draftRef, lanesCoordRef, viewSpanRef, barTicksRef, zoomPan.zoomHRef],
  );

  const contextMenus = useTimelineContextMenus({
    isMobilePreview,
    setTouchAlertOpen,
    clearMapSelection: selection.clearMapSelection,
    clipSelectionRef,
    setClipSelection: selection.setClipSelection,
    setSelectedSubsectionIdx: selection.setSelectedSubsectionIdx,
    setSelectedAnchorId: selection.setSelectedAnchorId,
    setSongMetaOpen,
    setInspectorVisible,
    selectLaneClip: panelState.selectLaneClip,
    clipboardRef: selection.clipboardRef,
    rawTicksAtClientX,
    draftRef: draft.draftRef,
    commitDraft: draft.commitDraft,
    copyClipSelection: selection.copyClipSelection,
    deleteSelectedFormaClip: selection.deleteSelectedFormaClip,
    duplicateClipSelection: selection.duplicateClipSelection,
    pasteClipClipboard: selection.pasteClipClipboard,
    focusInspectorPanel: panelState.focusInspectorPanel,
    openContextMenu,
    laneImportTrackIdRef,
    laneImportStartTicksRef,
    laneAudioFileRef,
    locatorTicks,
  });

  const gestures = useTimelineGestures({
    draftRef: draft.draftRef,
    draftProject: draft.draftProject,
    commitDraft: draft.commitDraft,
    state: transport.state,
    locatorTicks,
    seek: transport.seek,
    setLoop: transport.setLoop,
    setLocatorTicks,
    markerOverlayRef,
    lanesCoordRef,
    canvasScrollRef,
    viewSpanRef,
    barTicksRef,
    zoomHRef: zoomPan.zoomHRef,
    zoomHBaseRef: zoomPan.zoomHBaseRef,
    setZoomH: zoomPan.setZoomH,
    fitZoom: zoomPan.fitZoom,
    rawTicksAtClientX,
    toolRef,
    tool,
    gesturePolicy,
    setTouchAlertOpen,
    clipSelection: selection.clipSelection,
    setClipSelection: selection.setClipSelection,
    clearClipSelection: selection.clearClipSelection,
    selectLaneClip: panelState.selectLaneClip,
    selectedClipId: derivedSelection.selectedClipId,
    clearMapSelection: selection.clearMapSelection,
    setSelectedAnchorId: selection.setSelectedAnchorId,
    setSongMetaOpen,
    setSelectedSubsectionIdx: selection.setSelectedSubsectionIdx,
    deleteSelectedFormaClip: selection.deleteSelectedFormaClip,
    effectiveZoomH: zoomPan.effectiveZoomH,
    soloAudioTrackIds,
    setSoloAudioTrackIds,
    soloHoldRef,
    setCanvasNotice,
    canvasNoticeTimerRef,
    selectedMapLane: selection.selectedMapLane,
    selectedMapIds: selection.selectedMapIds,
    primaryMapId,
    setMapSelection: panelState.setMapSelection,
    setPrimaryMapId,
    openMapEdit: mapEdits.openMapEdit,
    keyHandlersRef,
    openPreferences,
    setHelpOpen: modals.setHelpOpen,
    projectId,
  });

  const canvasDerived = useTimelineCanvasDerived({
    draftProject: draft.draftProject,
    gesturePreview: gestures.gesturePreview,
    gestureSessionRef: gestures.gestureSessionRef,
    effectiveZoomH: zoomPan.effectiveZoomH,
    displayTicks: transport.displayTicks,
    locatorTicks,
    tool,
    tapLineIndex,
    state: transport.state,
    loopDraft: gestures.loopDraft,
    mapDragPreview: gestures.mapDragPreview,
    viewSpanRef,
    barTicksRef,
    effectiveLocatorTicksRef,
  });

  const playback = useTimelinePlayback({
    projectId,
    draftProject: draft.draftProject,
    draftRef: draft.draftRef,
    locatorTicks,
    setLocatorTicks,
    displayTicks: transport.displayTicks,
    clipSelection: selection.clipSelection,
    state: transport.state,
    seek: transport.seek,
    play: transport.play,
    pause: transport.pause,
    stop: transport.stop,
    soloAudioTrackIds,
    soloBusIds,
    canvasScrollRef,
    playheadPx: canvasDerived.playheadPx,
    meterAtPlayhead: derivedSelection.meterAtPlayhead,
    tempoAtPlayhead: derivedSelection.tempoAtPlayhead,
  });

  const [audioLaneDropId, setAudioLaneDropId] = useState<string | null>(null);

  const audioState = useTimelineAudioState({
    projectId,
    draftProject: draft.draftProject,
    commitDraft: draft.commitDraft,
    setSavedProject: draft.setSavedProject,
    setDraftProject: draft.setDraftProject,
    setDraftHistory: draft.setDraftHistory,
    setTrackVisibility,
    setLoadError: draft.setLoadError,
    trackSelection: selection.trackSelection,
    setTrackSelection: selection.setTrackSelection,
    setClipSelection: selection.setClipSelection,
    setSelectedBusId: selection.setSelectedBusId,
    setSelectedHwOutputId: selection.setSelectedHwOutputId,
    setInspectorVisible,
    setEyeOpen: floatingMenus.setEyeOpen,
    setSoloAudioTrackIds,
    setSoloBusIds,
    isMobilePreview,
    setTouchAlertOpen,
    openContextMenu,
    state: transport.state,
  });

  const shortcuts = useTimelineShortcutsAndSync({
    keyHandlersRef,
    onSave: draft.onSave,
    savedProject: draft.savedProject,
    projectId,
    reloadProject: draft.reloadProject,
    setDraftProject: draft.setDraftProject,
    setDraftHistory: draft.setDraftHistory,
    clearClipSelection: selection.clearClipSelection,
    onUndo: draft.onUndo,
    onRedo: draft.onRedo,
    cutClipSelection: selection.cutClipSelection,
    copyClipSelection: selection.copyClipSelection,
    pasteClipClipboard: selection.pasteClipClipboard,
    locatorTicks,
    audioBuffering: playback.audioBuffering,
    playing: transport.state.playing,
    onPauseClick: playback.onPauseClick,
    onPlayClick: playback.onPlayClick,
    onStopClick: playback.onStopClick,
    onMetronomeToggle: playback.onMetronomeToggle,
    onLoopToggle: gestures.onLoopToggle,
    onTool: floatingMenus.onTool,
    applyWand: wandTool.applyWand,
    nudgeLocator: gestures.nudgeLocator,
    fitZoom: zoomPan.fitZoom,
    zoomHorizontalBySteps: zoomPan.zoomHorizontalBySteps,
    applyAbsoluteZoomH: zoomPan.applyAbsoluteZoomH,
    zoomVerticalBySteps: zoomPan.zoomVerticalBySteps,
    dirty: draft.dirty,
    savePending: draft.savePending,
    tool,
    prevSetlistId: setlistState.prevSetlistId ?? null,
    nextSetlistId: setlistState.nextSetlistId ?? null,
    songImportOpen: modals.songImportOpen,
    helpOpen: modals.helpOpen,
    setHelpOpen: modals.setHelpOpen,
    toolRef,
    toolMenu: floatingMenus.toolMenu,
    setToolMenu: floatingMenus.setToolMenu,
    wandMenuOpenRef: floatingMenus.wandMenuOpenRef,
    setWandMenu: floatingMenus.setWandMenu,
    setTool,
    eyeMenuPos: floatingMenus.eyeMenuPos,
    setEyeMenuPos: floatingMenus.setEyeMenuPos,
    setEyeOpen: floatingMenus.setEyeOpen,
    toolsVisOpen: floatingMenus.toolsVisOpen,
    setToolsVisOpen: floatingMenus.setToolsVisOpen,
    closeContextMenu,
    closeMobileInspector: panelState.closeMobileInspector,
    duplicateClipSelection: selection.duplicateClipSelection,
    selectAllClips: selection.selectAllClips,
    splitSelectionAtPlayhead: selection.splitSelectionAtPlayhead,
    joinSelectionAdjacent: selection.joinSelectionAdjacent,
    deleteSelectedFormaClip: selection.deleteSelectedFormaClip,
    nudgeSelectedClip: selection.nudgeSelectedClip,
    setCycleFromSelectedAudioClip: selection.setCycleFromSelectedAudioClip,
    playFromSelectionOrLocator: playback.playFromSelectionOrLocator,
    toggleInspectorPanel: panelState.toggleInspectorPanel,
    setTimelineSurface,
    lastPointerRef,
    openToolMenuAt: floatingMenus.openToolMenuAt,
    effectiveLocatorTicksRef,
    tapLineIndexRef,
    setTapLineIndex,
    draftRef: draft.draftRef,
    commitDraft: draft.commitDraft,
    navigate,
    draftProject: draft.draftProject,
    setTrackVisibility,
    setFailedAudioAssetIds: playback.setFailedAudioAssetIds,
    setSoftClockTempoMaps: transport.setSoftClockTempoMaps,
    state: transport.state,
    displayTicks: transport.displayTicks,
    loopOn: canvasDerived.loopOn,
    soloAudioTrackIds,
    soloBusIds,
    latencyCompMs: playback.latencyCompMs,
    openSongImportWizard: modals.openSongImportWizard,
    selectedClip: derivedSelection.selectedClip,
  });

  const appHeader = useTimelineAppHeader({
    isMobilePreview,
    isCompactMobile,
    showOperatorNav,
    draftHistory: draft.draftHistory,
    dirty: draft.dirty,
    savePending: draft.savePending,
    onUndo: draft.onUndo,
    onRedo: draft.onRedo,
    onSave: draft.onSave,
    onDiscard: shortcuts.onDiscard,
    helpOpen: modals.helpOpen,
    setHelpOpen: modals.setHelpOpen,
  });

  return {
    rawTicksAtClientX,
    contextMenus,
    keyHandlersRef,
    gestures,
    canvasDerived,
    playback,
    audioLaneDropId,
    setAudioLaneDropId,
    audioState,
    shortcuts,
    appHeader,
  };
}
