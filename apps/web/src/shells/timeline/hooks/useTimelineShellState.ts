import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import {
  clearSelection,
  EMPTY_CLIP_SELECTION,
  selectSingle,
  type ClipSelection,
  type TimelineSurface,
} from "@lib/timeline/timelineSelection.js";
import {
  loadToolbarVisibleTools,
  type ToolbarToolId,
} from "@lib/timeline/timelineToolbarTools.js";
import { detectTimelineTier } from "@lib/timeline/timelineTouchTier.js";
import {
  defaultTrackVisibility,
  ensureAudioTrackVisibility,
  type TrackVisibilityMap,
} from "@lib/timeline/timelineTracks.js";
import { useAnnounceDevicePresence } from "@lib/client/useAnnounceDevicePresence.js";
import { markOperatorSession } from "@lib/shell-operator/operatorSession.js";
import { shouldShowOperatorNav } from "@lib/shell-operator/operatorSurface.js";
import { useMqMobileCompact } from "@lib/client/useMqMobileCompact.js";
import { loadTransport } from "../../../transport/api.js";
import { getFailedAudioAssetIds } from "@lib/audio/audioPlayback.js";
import { useTimelineModals } from "./useTimelineModals.js";
import { useTimelineDraft } from "./useTimelineDraft.js";
import { useTimelineZoomPan } from "./useTimelineZoomPan.js";
import { useTimelineSelectionState } from "./useTimelineSelectionState.js";
import { useTimelineMapEdits } from "./useTimelineMapEdits.js";
import { useTimelineWandTool } from "./useTimelineWandTool.js";
import { useTimelineSongImport } from "./useTimelineSongImport.js";
import { useTimelineSetlistState } from "./useTimelineSetlistState.js";
import { useTimelineDerivedSelection } from "./useTimelineDerivedSelection.js";
import { useTimelineFloatingMenus } from "./useTimelineFloatingMenus.js";
import { useTimelinePanelState } from "./useTimelinePanelState.js";
import { useTimelineTransportClock } from "./useTimelineTransportClock.js";
import { useTimelineTouchTierState } from "./useTimelineTouchTierState.js";
import { useTimelineCanvasNotice } from "./useTimelineCanvasNotice.js";
import { useTimelineShellInteractions } from "./useTimelineShellInteractions.js";
import { buildTimelineShellContainers } from "../containers/buildTimelineShellContainers.js";
import type { ToolId } from "../timelineToolsData.js";

export function useTimelineShellState() {
  useAnnounceDevicePresence(["timeline"]);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isCompactMobile = useMqMobileCompact();
  const showOperatorNav = shouldShowOperatorNav(pathname);

  useEffect(() => {
    markOperatorSession();
  }, []);

  const { projectId } = useParams<{ projectId: string }>();
  const lanesCoordRef = useRef<HTMLDivElement>(null);
  const markerOverlayRef = useRef<HTMLDivElement>(null);
  const canvasScrollRef = useRef<HTMLDivElement | null>(null);
  const laneAudioFileRef = useRef<HTMLInputElement>(null);
  const laneImportTrackIdRef = useRef<string | null>(null);
  const laneImportStartTicksRef = useRef<number | null>(null);

  // 1. Transport & Clock
  const transport = useTimelineTransportClock();
  const {
    state,
    displayTicks,
    setLoop,
    snapMode,
    setSnapMode,
  } = transport;

  // 2. Modals & UI Viewport State
  const modals = useTimelineModals();
  const [songMetaOpen, setSongMetaOpen] = useState(false);
  const [inspectorVisible, setInspectorVisible] = useState(
    () =>
      (typeof window !== "undefined" ? detectTimelineTier() : "desktop") !==
      "mobile",
  );
  const [touchAlertOpen, setTouchAlertOpen] = useState(false);
  const [tool, setTool] = useState<ToolId>("pointer");
  const toolRef = useRef<ToolId>("pointer");
  toolRef.current = tool;
  const soloHoldRef = useRef<string[] | null>(null);
  const effectiveLocatorTicksRef = useRef(0);
  const [tapLineIndex, setTapLineIndex] = useState(0);
  const tapLineIndexRef = useRef(0);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const [timelineSurface, setTimelineSurface] =
    useState<TimelineSurface>("timeline");

  const { touchTier, isMobilePreview, gesturePolicy } =
    useTimelineTouchTierState({
      setInspectorVisible,
      setSongMetaOpen,
      setTimelineSurface,
      setTool,
    });

  // 3. Floating menus & UI State
  const floatingMenus = useTimelineFloatingMenus({
    setTool,
    lastPointerRef,
    isMobilePreview,
    setTouchAlertOpen,
  });

  const [primaryMapId, setPrimaryMapId] = useState<string | null>(null);
  const [trackVisibility, setTrackVisibility] = useState<TrackVisibilityMap>(
    () => defaultTrackVisibility(),
  );
  const [soloAudioTrackIds, setSoloAudioTrackIds] = useState<string[]>([]);
  const [soloBusIds, setSoloBusIds] = useState<string[]>([]);
  const [toolbarVisibleTools, setToolbarVisibleTools] = useState<
    ToolbarToolId[]
  >(() => loadToolbarVisibleTools());
  const toolbarVisibleSet = useMemo(
    () => new Set<string>(toolbarVisibleTools),
    [toolbarVisibleTools],
  );
  const [locatorTicks, setLocatorTicks] = useState(0);
  const {
    canvasNotice,
    setCanvasNotice,
    canvasNoticeTimerRef,
    flashCanvasNotice,
  } = useTimelineCanvasNotice();

  const clipSelectionRef = useRef<ClipSelection>(EMPTY_CLIP_SELECTION);

  // 4. Draft & Song management
  const draft = useTimelineDraft({
    projectId,
    clipSelectionRef,
    onEnsureAudioTracks: (tracks) => {
      setTrackVisibility((prev) => ensureAudioTrackVisibility(prev, tracks));
    },
    onProjectLoaded: async (project) => {
      if (projectId) {
        await loadTransport(projectId);
        interactions.playback.setFailedAudioAssetIds(
          getFailedAudioAssetIds(projectId),
        );
      }
      setTrackVisibility(
        ensureAudioTrackVisibility(
          defaultTrackVisibility(project.audioTracks),
          project.audioTracks,
        ),
      );
      const first = project.forma.clips[0]?.id ?? null;
      selection.setClipSelection(
        first ? selectSingle(first, "forma") : clearSelection(),
      );
      selection.setSelectedSubsectionIdx(null);
    },
    onRestoreClipSelection: (sel) => {
      selection.setClipSelection(sel);
    },
  });
  const {
    draftProject,
    loading,
    loadError,
    draftRef,
    commitDraft,
  } = draft;

  const songImport = useTimelineSongImport({
    projectId: projectId ?? null,
    draftProject,
    draftRef,
    commitDraft,
    importAsNewSong: modals.importAsNewSong,
    setImportApplying: modals.setImportApplying,
    closeImportModals: modals.closeSongImportWizard,
    setSongScreenOpen: modals.setSongScreenOpen,
    setSongMetaOpen,
    flashCanvasNotice,
  });

  const mapEdits = useTimelineMapEdits({ draftProject, commitDraft });

  // 5. Selection & derived
  const selection = useTimelineSelectionState({
    draftRef,
    commitDraft,
    setSongMetaOpen,
    setLocatorTicks,
    setLoop,
    snapMode,
    displayTicks,
    setSoloBusIds,
    setSoloAudioTrackIds,
    setTrackVisibility,
  });

  const derivedSelection = useTimelineDerivedSelection({
    draftProject,
    clipSelection: selection.clipSelection,
    trackSelection: selection.trackSelection,
    selectedAnchorId: selection.selectedAnchorId,
    isMobilePreview,
    inspectorVisible,
    timelineSurface,
    displayTicks,
    state,
  });

  const wandTool = useTimelineWandTool({
    draftRef,
    clipSelection: selection.clipSelection,
    commitDraft,
    flashCanvasNotice,
    setWandMenu: floatingMenus.setWandMenu,
    setTool,
  });

  const viewSpanRef = useRef({ start: 0, end: 0 });
  const barTicksRef = useRef(3840);

  // 6. Zoom & Pan
  const zoomPan = useTimelineZoomPan({
    canvasScrollRef,
    viewSpanRef,
    barTicksRef,
    touchTier,
  });

  // 7. Panel & Setlist state
  const panelState = useTimelinePanelState({
    touchTier,
    setInspectorVisible,
    setSongMetaOpen,
    setClipSelection: selection.setClipSelection,
    clearClipSelection: selection.clearClipSelection,
    clearMapSelection: selection.clearMapSelection,
    setTrackSelection: selection.setTrackSelection,
    setSelectedAnchorId: selection.setSelectedAnchorId,
    setSelectedSubsectionIdx: selection.setSelectedSubsectionIdx,
    setSelectedMapLane: selection.setSelectedMapLane,
    setSelectedMapIds: selection.setSelectedMapIds,
    setPrimaryMapId,
  });

  const setlistState = useTimelineSetlistState({
    projectId,
    draftProjectName: draftProject?.name,
    songScreenOpen: modals.songScreenOpen,
    setlistSnapshot: transport.setlistSnapshot,
    reloadProject: draft.reloadProject,
  });

  // 8. Gestures, Audio, Shortcuts, Context menus & App header
  const interactions = useTimelineShellInteractions({
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
  });

  const {
    headerContainerProps,
    canvasViewportProps,
    dialogsContainerProps,
    rootClassName,
    touchPanAttr,
  } = buildTimelineShellContainers({
    header: {
      appHeader: interactions.appHeader,
      transport,
      modals,
      floatingMenus,
      setlistState,
      playback: interactions.playback,
      mapEdits,
      derivedSelection,
      selection,
      panelState,
      draftProject,
      projectId: projectId ?? null,
      pathname,
      shouldShowOperatorNav,
      isMobilePreview,
      toolbarVisibleSet,
      tool,
      timelineSurface,
      setTimelineSurface,
      loopOn: interactions.canvasDerived.loopOn,
      onLoopToggle: interactions.gestures.onLoopToggle,
      songMetaOpen,
      setSongMetaOpen,
      setInspectorVisible,
    },
    viewport: {
      draftProject,
      projectId: projectId ?? null,
      timelineSurface,
      touchTier,
      isMobilePreview,
      tool,
      trackVisibility,
      songMetaOpen,
      audioLaneDropId: interactions.audioLaneDropId,
      setAudioLaneDropId: interactions.setAudioLaneDropId,
      audioUploadPending: interactions.audioState.audioUploadPending,
      displayTicks,
      canvasScrollRef,
      markerOverlayRef,
      lanesCoordRef,
      laneImportTrackIdRef,
      laneImportStartTicksRef,
      laneAudioFileRef,
      draftRef,
      rawTicksAtClientX: interactions.rawTicksAtClientX,
      derivedSelection,
      selection,
      zoomPan,
      gestures: interactions.gestures,
      canvasDerived: interactions.canvasDerived,
      playback: interactions.playback,
      audioState: interactions.audioState,
      panelState,
      floatingMenus,
      contextMenus: interactions.contextMenus,
      modals,
      mapEdits,
      shortcuts: interactions.shortcuts,
    },
    dialogs: {
      draft,
      shortcuts: interactions.shortcuts,
      modals,
      setlistState,
      songImport,
      floatingMenus,
      audioState: interactions.audioState,
      mapEdits,
      toolbarVisibleSet,
      setToolbarVisibleTools,
      displayTicks,
      touchAlertOpen,
      setTouchAlertOpen,
      tool,
    },
    laneResizeTrackId: zoomPan.laneResizeTrackId,
    dockWidthResizing: zoomPan.dockWidthResizing,
    heldZoom: interactions.gestures.heldZoom,
    tool,
  });

  return {
    projectId,
    loading,
    loadError,
    draftProject,
    rootClassName,
    touchTier,
    touchPanAttr,
    laneAudioFileRef,
    audioUploadPending: interactions.audioState.audioUploadPending,
    laneImportTrackIdRef,
    laneImportStartTicksRef,
    onUploadAudioToTrack: interactions.audioState.onUploadAudioToTrack,
    headerContainerProps,
    canvasViewportProps,
    wsStatus: transport.wsStatus,
    isMobilePreview,
    snapMode,
    setSnapMode,
    zoomUi: zoomPan.zoomUi,
    setZoomUi: zoomPan.setZoomUi,
    zoomH: zoomPan.zoomH,
    setZoomH: zoomPan.setZoomH,
    zoomV: zoomPan.zoomV,
    setVerticalZoom: zoomPan.setVerticalZoom,
    timelineSurface,
    selectionLane: derivedSelection.selectionLane,
    primaryId: derivedSelection.primaryId,
    commitDraft,
    canvasNotice,
    dialogsContainerProps,
  };
}
