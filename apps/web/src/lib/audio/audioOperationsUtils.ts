/**
 * Audio lane edit — Pointer/Smart move + trim; Pencil @ empty = import ([ADR 0008]/[ADR 0015]).
 */

import {
  resolveMeterAt,
  resolveTempoAt,
  type AudioClip,
  type FormaClip,
  type Project,
} from "@stagesync/shared";
import { resolveSplitParentId } from "@lib/timeline-edit/contentLaneEdit.js";

export function audioAsForma(clips: AudioClip[]): FormaClip[] {
  return clips.map((c) => ({
    id: c.id,
    name: c.id,
    kind: "section" as const,
    startTicks: c.startTicks,
    lengthTicks: c.lengthTicks,
  }));
}

export function mapFormaBack(
  project: Project,
  trackId: string,
  formaClips: FormaClip[],
  seedById: Map<string, AudioClip>,
): Project {
  const others = project.audioClips.filter((c) => c.trackId !== trackId);
  const onTrack: AudioClip[] = formaClips
    .filter((c) => c.kind === "section")
    .map((c) => {
      const prev =
        seedById.get(c.id) ?? seedById.get(resolveSplitParentId(c.id));
      if (!prev) throw new Error(`Missing audio clip seed for ${c.id}`);
      return {
        ...prev,
        id: c.id,
        startTicks: c.startTicks,
        lengthTicks: c.lengthTicks,
      };
    });
  return { ...project, audioClips: [...others, ...onTrack] };
}

export function clipsOnTrack(project: Project, trackId: string): AudioClip[] {
  return project.audioClips.filter((c) => c.trackId === trackId);
}

export function tempoCtxAt(project: Project, ticks: number) {
  return {
    bpm: resolveTempoAt(project, ticks),
    meter: resolveMeterAt(project, ticks),
    ppq: project.ppq,
  };
}

export function assetOf(project: Project, assetId: string) {
  return project.assets.find((a) => a.id === assetId) ?? null;
}
