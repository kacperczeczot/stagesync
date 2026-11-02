/**
 * Pure MIDI Note Chasing on transport seek ([ADR 0002]/[ADR 0010]).
 *
 * When transport seeks to a new tick position (seekTicks), notes that started
 * before seekTicks but have not yet finished would be silent without chasing.
 *
 * This module identifies all active notes spanning seekTicks, and computes:
 * - offsetTicks: ticks elapsed since note started
 * - remainingTicks: ticks remaining until note off
 * - retriggerTicks: tick at which note is re-anchored
 */

import { z } from "zod";
import type { MelodyNoteClip } from "../project/schema/clips.js";

export const ChasedMidiNoteSchema = z.object({
  id: z.string().min(1),
  pitchMidi: z.number().int().min(0).max(127),
  startTicks: z.number().int(),
  originalLengthTicks: z.number().int().positive(),
  seekTicks: z.number().int(),
  offsetTicks: z.number().int().nonnegative(),
  remainingTicks: z.number().int().positive(),
});

export type ChasedMidiNote = z.infer<typeof ChasedMidiNoteSchema>;

/**
 * Find notes spanning seekTicks and calculate their remaining playback durations.
 *
 * Boundary rules:
 * - note.startTicks <= seekTicks AND (note.startTicks + note.lengthTicks) > seekTicks
 * - notes ending exactly at seekTicks are excluded (they already finished)
 * - notes starting after seekTicks are excluded (they will play normally later)
 */
export function chaseMidiNotes(
  clips: readonly MelodyNoteClip[],
  seekTicks: number,
): ChasedMidiNote[] {
  if (!Number.isFinite(seekTicks)) return [];
  const targetTicks = Math.floor(seekTicks);

  const chased: ChasedMidiNote[] = [];

  for (const clip of clips) {
    const endTicks = clip.startTicks + clip.lengthTicks;
    if (clip.startTicks <= targetTicks && endTicks > targetTicks) {
      const offsetTicks = targetTicks - clip.startTicks;
      const remainingTicks = endTicks - targetTicks;
      chased.push({
        id: clip.id,
        pitchMidi: clip.pitchMidi,
        startTicks: clip.startTicks,
        originalLengthTicks: clip.lengthTicks,
        seekTicks: targetTicks,
        offsetTicks,
        remainingTicks,
      });
    }
  }

  // Sort by startTicks ascending, then pitchMidi
  return chased.sort(
    (a, b) => a.startTicks - b.startTicks || a.pitchMidi - b.pitchMidi,
  );
}
