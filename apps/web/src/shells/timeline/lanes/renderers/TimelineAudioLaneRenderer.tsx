import React from "react";
import type {
  AudioClip,
  AudioTrack,
  FormaClip,
  Project,
} from "@stagesync/shared";
import {
  elapsedToTicks,
  resolveMeterAt,
  resolveTempoAt,
  resolveTrackColor,
} from "@stagesync/shared";
import {
  audioTrackIdFromLane,
  type AudioLaneId,
} from "@lib/timeline/timelineTracks.js";
import { clipStylePx } from "@lib/timeline-edit/formaCanvas.js";
import { peaksToPolylinePoints } from "@lib/audio/waveformPeaks.js";
import {
  isClipSelected,
  type ClipSelection,
  type ClipSelectionLane,
} from "@lib/timeline/timelineSelection.js";
import { isAudioAssetDecodeFailed } from "@lib/audio/audioPlayback.js";
import type { ClipMenuLane } from "@lib/timeline/timelineContextMenus.js";
import styles from "../../TimelineShell.module.css";

/**
 * Maps clip gain dB [-60, +24] to lane SVG Y coordinate.
 * 0 dB (unity gain) is right at the vertical center (centerY = H / 2).
 * Boost (>0 to +24 dB): maps center -> top edge (3px).
 * Cut (<0 to -60 dB): maps center -> bottom edge (H - 3px) with audio taper.
 */
export function gainDbToLaneY(gainDb: number, H = 28): number {
  const centerY = H / 2;
  if (!Number.isFinite(gainDb) || gainDb === 0) return centerY;
  if (gainDb > 0) {
    const norm = Math.min(1, Math.max(0, gainDb / 24));
    return centerY - norm * (centerY - 3);
  }
  const norm = Math.min(1, Math.max(0, -gainDb / 60));
  const taper = Math.pow(norm, 0.7);
  return centerY + taper * (H - 3 - centerY);
}

export type TimelineAudioLaneRendererProps = {
  lane: AudioLaneId;
  draftProject: Project;
  projectId?: string;
  failedAudioAssetIds: string[];
  gestureSession: {
    kind?: string;
    lane?: string;
    moveIds?: string[];
    clipId?: string | null;
    originClipStart?: number;
    optionCopy?: boolean;
    hasDragged?: boolean;
  } | null;
  gesturePreview: {
    kind?: string;
    clipId?: string | null;
    startTicks: number;
    lengthTicks: number;
    targetLane?: string;
    gainDb?: number;
    fadeInMs?: number;
    fadeOutMs?: number;
  } | null;
  clipSelection: ClipSelection;
  viewSpan: { start: number; end: number };
  barTicks: number;
  effectiveZoomH: number;
  openClipContextMenu: (args: {
    clientX: number;
    clientY: number;
    lane: ClipMenuLane;
    clipId: string;
    clipMuted?: boolean;
    canSplit: boolean;
    canDelete?: boolean;
    selectionLane: ClipSelectionLane;
  }) => void;
  onAudioClipPointerDown: (
    e: React.PointerEvent<HTMLButtonElement>,
    lane: AudioLaneId,
    clip: AudioClip,
  ) => void;
  onFormaClipPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  onFormaClipPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
};

export function TimelineAudioLaneRenderer({
  lane,
  draftProject,
  projectId,
  failedAudioAssetIds,
  gestureSession,
  gesturePreview,
  clipSelection,
  viewSpan,
  barTicks,
  effectiveZoomH,
  openClipContextMenu,
  onAudioClipPointerDown,
  onFormaClipPointerMove,
  onFormaClipPointerUp,
}: TimelineAudioLaneRendererProps): React.ReactNode {
  const trackUuid = audioTrackIdFromLane(lane);
  const clips = draftProject.audioClips.filter((c) => c.trackId === trackUuid);
  const assetById = new Map(draftProject.assets.map((a) => [a.id, a]));
  const trackColor = resolveTrackColor(
    draftProject.audioTracks.find((t: AudioTrack) => t.id === trackUuid)?.color,
  );

  const isAudioMoving =
    gestureSession?.kind === "move" &&
    (gestureSession.lane ?? "").startsWith("audio-");
  const sourceAudioLane = isAudioMoving
    ? (gestureSession!.lane as AudioLaneId)
    : null;
  const targetAudioLane = isAudioMoving
    ? ((gesturePreview?.targetLane as AudioLaneId | undefined) ??
      sourceAudioLane)
    : null;
  const moveIds = isAudioMoving
    ? gestureSession!.moveIds?.length
      ? gestureSession!.moveIds
      : gestureSession!.clipId
        ? [gestureSession!.clipId]
        : []
    : [];
  const moveDelta =
    gesturePreview && isAudioMoving && gestureSession?.originClipStart != null
      ? gesturePreview.startTicks - gestureSession.originClipStart
      : 0;

  const isTargetLane =
    isAudioMoving &&
    targetAudioLane === lane &&
    targetAudioLane !== sourceAudioLane;
  const ghostClips = isTargetLane
    ? moveIds
        .map((id: string) => draftProject.audioClips.find((c) => c.id === id))
        .filter((c: AudioClip | undefined): c is AudioClip => Boolean(c))
    : [];

  return (
    <>
      {clips.map((clip) => {
        const asset = assetById.get(clip.assetId);
        const isBeingMoved = isAudioMoving && moveIds.includes(clip.id);
        const isSourceLane = isAudioMoving && sourceAudioLane === lane;

        const previewing =
          Boolean(gesturePreview) &&
          ((isSourceLane && isBeingMoved) ||
            (gestureSession?.lane === lane &&
              gesturePreview!.clipId === clip.id &&
              gesturePreview!.kind !== "move"));

        const styleClip: FormaClip = {
          id: clip.id,
          name: asset?.originalName ?? "Audio",
          kind: "section",
          startTicks:
            previewing && isSourceLane && isBeingMoved
              ? targetAudioLane === sourceAudioLane
                ? clip.startTicks + moveDelta
                : clip.startTicks
              : previewing
                ? gesturePreview!.startTicks
                : clip.startTicks,
          lengthTicks: previewing
            ? gestureSession?.kind === "move"
              ? clip.lengthTicks
              : gesturePreview!.lengthTicks
            : clip.lengthTicks,
        };
        const style = clipStylePx(
          styleClip,
          viewSpan,
          barTicks,
          effectiveZoomH,
        );
        const widthPx = Number.parseFloat(String(style.width)) || 0;
        const W = Math.max(8, widthPx);
        const H = 28; // SVG coordinate height
        const peaks = asset?.waveformPeaks;
        const poly =
          peaks && peaks.length
            ? peaksToPolylinePoints(peaks, W, H)
            : "";

        // Gain line — use live gesture preview during drag, else clip.gainDb (default 0 dB)
        const effectiveGainDb =
          previewing && gesturePreview?.gainDb != null
            ? gesturePreview.gainDb
            : (clip.gainDb ?? 0);
        const gainY = gainDbToLaneY(effectiveGainDb, H);
        const isGainActive =
          effectiveGainDb !== 0 ||
          (previewing && gesturePreview?.gainDb != null);

        // Fade pixel widths — accurate timeline geometry based on clip start tempo & meter
        const bpm = resolveTempoAt(draftProject, clip.startTicks);
        const meter = resolveMeterAt(draftProject, clip.startTicks);
        const ppq = draftProject.ppq;

        const effectiveFadeInMs =
          previewing && gesturePreview?.fadeInMs != null
            ? gesturePreview.fadeInMs
            : (clip.fadeInMs ?? 0);
        const effectiveFadeOutMs =
          previewing && gesturePreview?.fadeOutMs != null
            ? gesturePreview.fadeOutMs
            : (clip.fadeOutMs ?? 0);

        const inTicks =
          effectiveFadeInMs > 0
            ? elapsedToTicks(effectiveFadeInMs, bpm, meter, ppq)
            : 0;
        const outTicks =
          effectiveFadeOutMs > 0
            ? elapsedToTicks(effectiveFadeOutMs, bpm, meter, ppq)
            : 0;

        const clipTicks = Math.max(1, clip.lengthTicks);
        const fadeInRatio = Math.min(1, Math.max(0, inTicks / clipTicks));
        const fadeOutRatio = Math.min(1, Math.max(0, outTicks / clipTicks));

        const fadeInPx =
          effectiveFadeInMs > 0
            ? Math.max(2, Math.min(W, Math.round(fadeInRatio * W)))
            : 0;
        const fadeOutPx =
          effectiveFadeOutMs > 0
            ? Math.max(2, Math.min(W, Math.round(fadeOutRatio * W)))
            : 0;

        const showOverlay = true;

        const decodeFailed =
          Boolean(projectId) &&
          (failedAudioAssetIds.includes(clip.assetId) ||
            isAudioAssetDecodeFailed(projectId!, clip.assetId));
        return (
          <button
            key={clip.id}
            type="button"
            data-clip-id={clip.id}
            data-clip-lane={lane}
            className={[
              styles.clip,
              styles.audioClip,
              isClipSelected(clipSelection, clip.id, lane)
                ? styles.clipSelected
                : "",
              clip.muted ? styles.audioClipMuted : "",
              decodeFailed ? styles.audioClipDecodeFailed : "",
              previewing ? styles.formaClipDim : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{
              ...style,
              ["--tl-track-color" as string]: trackColor,
            }}
            title={
              decodeFailed
                ? `${asset?.originalName ?? "Audio"} — błąd wczytania / dekodowania`
                : `${asset?.originalName ?? "Audio"} — move/trim`
            }
            onPointerDown={(e) => onAudioClipPointerDown(e, lane, clip)}
            onPointerMove={onFormaClipPointerMove}
            onPointerUp={onFormaClipPointerUp}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openClipContextMenu({
                clientX: e.clientX,
                clientY: e.clientY,
                lane: "audio",
                clipId: clip.id,
                clipMuted: Boolean(clip.muted),
                canSplit: true,
                selectionLane: lane,
              });
            }}
          >
            {showOverlay ? (
              <svg
                className={styles.audioWaveform}
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                aria-hidden
              >
                {/* Waveform polygon */}
                {poly ? <polygon points={poly} className={styles.audioWaveformPoly} /> : null}

                {/* Fade-in: shaded triangle + diagonal line */}
                {fadeInPx > 0 ? (
                  <>
                    <polygon
                      points={`0,0 ${fadeInPx},0 0,${H}`}
                      className={styles.audioFadeFill}
                    />
                    <line
                      x1={0} y1={H}
                      x2={fadeInPx} y2={0}
                      className={styles.audioFadeLine}
                    />
                  </>
                ) : null}

                {/* Fade-out: shaded triangle + diagonal line */}
                {fadeOutPx > 0 ? (
                  <>
                    <polygon
                      points={`${W - fadeOutPx},0 ${W},0 ${W},${H}`}
                      className={styles.audioFadeFill}
                    />
                    <line
                      x1={W - fadeOutPx} y1={0}
                      x2={W} y2={H}
                      className={styles.audioFadeLine}
                    />
                  </>
                ) : null}

                {/* Gain envelope line */}
                <line
                  x1={0}
                  y1={gainY}
                  x2={W}
                  y2={gainY}
                  className={
                    isGainActive
                      ? styles.audioGainLineActive
                      : styles.audioGainLine
                  }
                />
                {isGainActive ? (
                  <>
                    <circle
                      cx={0}
                      cy={gainY}
                      r={2}
                      className={styles.audioGainDot}
                    />
                    <circle
                      cx={W}
                      cy={gainY}
                      r={2}
                      className={styles.audioGainDot}
                    />
                  </>
                ) : null}
                {previewing && gesturePreview?.gainDb != null ? (
                  <text
                    x={W / 2}
                    y={Math.max(10, Math.min(H - 4, gainY - 3))}
                    className={styles.audioGainText}
                  >
                    {effectiveGainDb > 0 ? "+" : ""}
                    {effectiveGainDb.toFixed(1)} dB
                  </text>
                ) : null}
              </svg>
            ) : null}
            <span className={styles.audioClipLabel}>
              {asset?.originalName ?? "Audio"}
            </span>
          </button>
        );
      })}

      {ghostClips.map((ghostClip: AudioClip) => {
        const asset = assetById.get(ghostClip.assetId);
        const styleClip: FormaClip = {
          id: `ghost-${ghostClip.id}`,
          name: asset?.originalName ?? "Audio",
          kind: "section",
          startTicks: ghostClip.startTicks + moveDelta,
          lengthTicks: ghostClip.lengthTicks,
        };
        const style = clipStylePx(
          styleClip,
          viewSpan,
          barTicks,
          effectiveZoomH,
        );
        const widthPx = Number.parseFloat(String(style.width)) || 0;
        const W = Math.max(8, widthPx);
        const H = 28;
        const peaks = asset?.waveformPeaks;
        const poly =
          peaks && peaks.length
            ? peaksToPolylinePoints(peaks, W, H)
            : "";
        const gBpm = resolveTempoAt(draftProject, ghostClip.startTicks);
        const gMeter = resolveMeterAt(draftProject, ghostClip.startTicks);
        const gGainDb = ghostClip.gainDb ?? 0;
        const gGainY = gainDbToLaneY(gGainDb, H);
        const gInTicks =
          (ghostClip.fadeInMs ?? 0) > 0
            ? elapsedToTicks(ghostClip.fadeInMs!, gBpm, gMeter, draftProject.ppq)
            : 0;
        const gOutTicks =
          (ghostClip.fadeOutMs ?? 0) > 0
            ? elapsedToTicks(ghostClip.fadeOutMs!, gBpm, gMeter, draftProject.ppq)
            : 0;
        const gClipTicks = Math.max(1, ghostClip.lengthTicks);
        const gFadeInPx =
          (ghostClip.fadeInMs ?? 0) > 0
            ? Math.max(2, Math.min(W, Math.round((gInTicks / gClipTicks) * W)))
            : 0;
        const gFadeOutPx =
          (ghostClip.fadeOutMs ?? 0) > 0
            ? Math.max(2, Math.min(W, Math.round((gOutTicks / gClipTicks) * W)))
            : 0;
        const gGainActive = gGainDb !== 0;
        const showGhostOverlay = true;
        return (
          <button
            key={`ghost-${ghostClip.id}`}
            type="button"
            className={[
              styles.clip,
              styles.audioClip,
              styles.formaClipDim,
            ].join(" ")}
            style={{
              ...style,
              ["--tl-track-color" as string]: trackColor,
            }}
            disabled
          >
            {showGhostOverlay ? (
              <svg
                className={styles.audioWaveform}
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                aria-hidden
              >
                {poly ? <polygon points={poly} className={styles.audioWaveformPoly} /> : null}
                {gFadeInPx > 0 ? (
                  <>
                    <polygon points={`0,0 ${gFadeInPx},0 0,${H}`} className={styles.audioFadeFill} />
                    <line x1={0} y1={H} x2={gFadeInPx} y2={0} className={styles.audioFadeLine} />
                  </>
                ) : null}
                {gFadeOutPx > 0 ? (
                  <>
                    <polygon points={`${W - gFadeOutPx},0 ${W},0 ${W},${H}`} className={styles.audioFadeFill} />
                    <line x1={W - gFadeOutPx} y1={0} x2={W} y2={H} className={styles.audioFadeLine} />
                  </>
                ) : null}
                <line
                  x1={0}
                  y1={gGainY}
                  x2={W}
                  y2={gGainY}
                  className={
                    gGainActive
                      ? styles.audioGainLineActive
                      : styles.audioGainLine
                  }
                />
                {gGainActive ? (
                  <>
                    <circle cx={0} cy={gGainY} r={1.5} className={styles.audioGainDot} />
                    <circle cx={W} cy={gGainY} r={1.5} className={styles.audioGainDot} />
                  </>
                ) : null}
              </svg>
            ) : null}
            <span className={styles.audioClipLabel}>
              {asset?.originalName ?? "Audio"}
            </span>
          </button>
        );
      })}
    </>
  );
}
