import { buildTimelineHeaderProps } from "./buildTimelineHeaderProps.js";
import { buildTimelineCanvasViewportProps } from "./buildTimelineCanvasViewportProps.js";
import { buildTimelineDialogsProps } from "./buildTimelineDialogsProps.js";
import { toolNeedsExclusiveTouchAction } from "@lib/timeline/timelineGesture.js";
import type { ToolId } from "../timelineToolsData.js";
import styles from "../TimelineShell.module.css";

export interface TimelineShellContainersInput {
  header: Parameters<typeof buildTimelineHeaderProps>[0];
  viewport: Parameters<typeof buildTimelineCanvasViewportProps>[0];
  dialogs: Parameters<typeof buildTimelineDialogsProps>[0];
  laneResizeTrackId: string | null;
  dockWidthResizing: boolean;
  heldZoom: boolean;
  tool: ToolId;
}

export function buildTimelineShellContainers(
  input: TimelineShellContainersInput,
) {
  const headerContainerProps = buildTimelineHeaderProps(input.header);
  const canvasViewportProps = buildTimelineCanvasViewportProps(input.viewport);
  const dialogsContainerProps = buildTimelineDialogsProps(input.dialogs);

  const rootClassName = [
    styles.shell,
    input.laneResizeTrackId ? styles.laneResizing : "",
    input.dockWidthResizing ? styles.dockWidthResizing : "",
  ]
    .filter(Boolean)
    .join(" ");

  const touchPanAttr = toolNeedsExclusiveTouchAction(
    input.heldZoom ? "zoom" : input.tool,
  )
    ? undefined
    : "";

  return {
    headerContainerProps,
    canvasViewportProps,
    dialogsContainerProps,
    rootClassName,
    touchPanAttr,
  };
}
