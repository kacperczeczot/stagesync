import React from "react";
import type { Project, AudioClip } from "@stagesync/shared";
import {
  setAudioClipFadeMs,
  setAudioClipGainDb,
  setAudioClipLoop,
  setAudioClipMuted,
  setAudioClipTrimMs,
} from "@lib/audio/audioLaneEdit.js";
import styles from "../TimelineShell.module.css";

export function AudioClipInspector({
  draftProject,
  commitDraft,
  selectedAudioClip,
}: {
  draftProject: Project | null;
  commitDraft: (next: Project) => void;
  selectedAudioClip: AudioClip;
}) {
  return (
    <div className={styles.inspBody}>
      <p className={styles.muted}>Klip audio</p>
      <p className={styles.muted}>
        {draftProject?.assets.find((a) => a.id === selectedAudioClip.assetId)
          ?.originalName ?? "Audio"}
      </p>
      <label className={styles.inspField}>
        <input
          type="checkbox"
          checked={Boolean(selectedAudioClip.muted)}
          onChange={(e) => {
            if (!draftProject) return;
            commitDraft(
              setAudioClipMuted(
                draftProject,
                selectedAudioClip.id,
                e.target.checked,
              ),
            );
          }}
        />{" "}
        Wycisz klip
      </label>
      <label className={styles.inspField}>
        Trim początku (ms)
        <input
          className={styles.lengthInput}
          type="number"
          min={0}
          step={1}
          value={selectedAudioClip.trimInMs ?? 0}
          onChange={(e) => {
            if (!draftProject) return;
            const n = Number(e.target.value);
            if (!Number.isFinite(n) || n < 0) return;
            commitDraft(
              setAudioClipTrimMs(draftProject, selectedAudioClip.id, {
                trimInMs: n,
              }),
            );
          }}
        />
      </label>
      <label className={styles.inspField}>
        Trim końca (ms)
        <input
          className={styles.lengthInput}
          type="number"
          min={0}
          step={1}
          value={selectedAudioClip.trimOutMs ?? 0}
          onChange={(e) => {
            if (!draftProject) return;
            const n = Number(e.target.value);
            if (!Number.isFinite(n) || n < 0) return;
            commitDraft(
              setAudioClipTrimMs(draftProject, selectedAudioClip.id, {
                trimOutMs: n,
              }),
            );
          }}
        />
      </label>
      <label className={styles.inspField}>
        Gain klipu (dB)
        <input
          className={styles.lengthInput}
          type="number"
          min={-60}
          max={24}
          step={0.5}
          value={selectedAudioClip.gainDb ?? 0}
          aria-label="Gain klipu (dB)"
          onChange={(e) => {
            if (!draftProject) return;
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            commitDraft(
              setAudioClipGainDb(draftProject, selectedAudioClip.id, n),
            );
          }}
        />
      </label>
      <label className={styles.inspField}>
        Fade In (ms)
        <input
          className={styles.lengthInput}
          type="number"
          min={0}
          step={5}
          value={selectedAudioClip.fadeInMs ?? 0}
          aria-label="Fade In (ms)"
          onChange={(e) => {
            if (!draftProject) return;
            const n = Number(e.target.value);
            if (!Number.isFinite(n) || n < 0) return;
            commitDraft(
              setAudioClipFadeMs(draftProject, selectedAudioClip.id, {
                fadeInMs: n,
              }),
            );
          }}
        />
      </label>
      <label className={styles.inspField}>
        Fade Out (ms)
        <input
          className={styles.lengthInput}
          type="number"
          min={0}
          step={5}
          value={selectedAudioClip.fadeOutMs ?? 0}
          aria-label="Fade Out (ms)"
          onChange={(e) => {
            if (!draftProject) return;
            const n = Number(e.target.value);
            if (!Number.isFinite(n) || n < 0) return;
            commitDraft(
              setAudioClipFadeMs(draftProject, selectedAudioClip.id, {
                fadeOutMs: n,
              }),
            );
          }}
        />
      </label>
      <label className={styles.inspField}>
        <input
          type="checkbox"
          checked={Boolean(selectedAudioClip.loop)}
          onChange={(e) => {
            if (!draftProject) return;
            commitDraft(
              setAudioClipLoop(
                draftProject,
                selectedAudioClip.id,
                e.target.checked,
              ),
            );
          }}
        />{" "}
        Pętla
      </label>
    </div>
  );
}
