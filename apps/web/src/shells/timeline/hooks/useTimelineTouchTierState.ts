import { useEffect, useState } from "react";
import {
  detectTimelineTier,
  TIMELINE_COARSE_MQ,
  TIMELINE_LANDSCAPE_PHONE_MQ,
  TIMELINE_MOBILE_MQ,
  timelineGesturesAllowed,
  type TimelineTouchTier,
} from "@lib/timeline/timelineTouchTier.js";
import type { TimelineSurface } from "@lib/timeline/timelineSelection.js";
import type { ToolId } from "../timelineToolsData.js";

export interface UseTimelineTouchTierParams {
  setInspectorVisible: (visible: boolean) => void;
  setSongMetaOpen: (open: boolean) => void;
  setTimelineSurface: (surface: TimelineSurface) => void;
  setTool: (fn: (tool: ToolId) => ToolId) => void;
}

export function useTimelineTouchTierState(params: {
  setInspectorVisible: (visible: boolean) => void;
  setSongMetaOpen: (open: boolean) => void;
  setTimelineSurface: (surface: TimelineSurface) => void;
  setTool: (fn: (tool: ToolId) => ToolId) => void;
}) {
  const [touchTier, setTouchTier] = useState<TimelineTouchTier>(() =>
    typeof window !== "undefined" ? detectTimelineTier() : "desktop",
  );
  const isMobilePreview = touchTier === "mobile";
  const gesturePolicy = timelineGesturesAllowed(touchTier);

  useEffect(() => {
    const syncTier = () => setTouchTier(detectTimelineTier());
    syncTier();
    const mobileMq = window.matchMedia(TIMELINE_MOBILE_MQ);
    const landscapeMq = window.matchMedia(TIMELINE_LANDSCAPE_PHONE_MQ);
    const coarseMq = window.matchMedia(TIMELINE_COARSE_MQ);
    mobileMq.addEventListener("change", syncTier);
    landscapeMq.addEventListener("change", syncTier);
    coarseMq.addEventListener("change", syncTier);
    window.addEventListener("resize", syncTier);
    return () => {
      mobileMq.removeEventListener("change", syncTier);
      landscapeMq.removeEventListener("change", syncTier);
      coarseMq.removeEventListener("change", syncTier);
      window.removeEventListener("resize", syncTier);
    };
  }, []);

  const { setInspectorVisible, setSongMetaOpen, setTimelineSurface, setTool } =
    params;

  useEffect(() => {
    if (!isMobilePreview) return;
    setInspectorVisible(false);
    setSongMetaOpen(false);
    setTimelineSurface("timeline");
    setTool((t) => (t === "tap" ? "pointer" : t));
  }, [
    isMobilePreview,
    setInspectorVisible,
    setSongMetaOpen,
    setTimelineSurface,
    setTool,
  ]);

  return { touchTier, isMobilePreview, gesturePolicy };
}
