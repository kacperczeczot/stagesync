/**
 * Pinned Stereo Out / master strip — dual L+R meters + master fader (no pan).
 * Optional Out selector remaps Master onto a physical stereo pair.
 */

import { Button } from "@stagesync/ui";
import type {
  MasterStripCallbacks,
  MasterStripState,
} from "./channelStripTypes.js";
import { DualDbReadout } from "./DualDbReadout.js";
import { meterPaintKey } from "./meterPaint.js";
import { OutputSelector } from "./OutputSelector.js";
import { PeakMeter } from "./PeakMeter.js";
import { VerticalFader } from "./VerticalFader.js";
import styles from "./ChannelStripControls.module.css";

export type MasterStripProps = {
  state: MasterStripState;
  callbacks: MasterStripCallbacks;
};

export function MasterStrip({ state, callbacks }: MasterStripProps) {
  const gainDb = state.gainDb ?? 0;
  const holdMerged = {
    holdDb: Math.max(state.holdL.holdDb, state.holdR.holdDb),
    clipped: state.holdL.clipped || state.holdR.clipped,
  };
  const hasOutSelector =
    state.outputOptions != null && state.outputOptions.length > 0;

  return (
    <div
      className={[styles.mixerStrip, styles.masterStrip].join(" ")}
      role="group"
      aria-label="Stereo Out"
    >
      {/* Spacers align DualDb / fader with track strips (M·ST, Out, Pan). */}
      <div className={styles.channelModeSpacer} aria-hidden />
      {hasOutSelector ? (
        <OutputSelector
          value={state.outputValue ?? "ch:0"}
          options={state.outputOptions!}
          aria-label="Out Master"
          disabled={Boolean(state.outputDisabled)}
          onChange={(v) => callbacks.onOutputChange?.(v)}
        />
      ) : (
        <div className={styles.outputSelectSpacer} aria-hidden />
      )}
      <div className={styles.masterPanSpacer} aria-hidden />

      <DualDbReadout
        gainDb={gainDb}
        hold={holdMerged}
        onGainReset={callbacks.onGainReset}
        onHoldClear={() => callbacks.onHoldClear?.()}
        gainAriaLabel="Fader Stereo Out"
        holdAriaLabel="Peak Hold Stereo Out — kliknij aby wyzerować"
      />

      <div className={styles.faderMeterRow}>
        <VerticalFader
          gainDb={gainDb}
          onGainChange={callbacks.onGainChange}
          onGainReset={callbacks.onGainReset}
          aria-label="Fader Stereo Out"
        />
        <PeakMeter
          db={state.meterL}
          dbR={state.meterR}
          paintKeyL={meterPaintKey("master", "stereo", "l")}
          paintKeyR={meterPaintKey("master", "stereo", "r")}
          aria-label="Miernik Stereo Out"
        />
      </div>

      {/* Match track / Click S·M row — global Solo / Mute Off buttons */}
      <div className={styles.mixerTools} onClick={(e) => e.stopPropagation()}>
        <Button
          variant="ghost"
          iconOnly
          selected={Boolean(state.hasAnySolo)}
          className={[
            styles.masterSoloClearBtn,
            state.hasAnySolo ? styles.tapBtnSolo : styles.masterToolInactive,
          ]
            .filter(Boolean)
            .join(" ")}
          title={
            state.hasAnySolo
              ? "Wyłącz wszystkie solo (⌥S)"
              : "Brak aktywnych solo"
          }
          aria-label={
            state.hasAnySolo
              ? "Wyłącz wszystkie solo (⌥S)"
              : "Brak aktywnych solo"
          }
          disabled={!state.hasAnySolo}
          onClick={(e) => {
            e.stopPropagation();
            if (e.altKey || e.shiftKey) {
              callbacks.onClearAllSoloMute?.();
            } else {
              callbacks.onClearAllSolo?.();
            }
          }}
        >
          S
        </Button>
        <Button
          variant="ghost"
          iconOnly
          selected={Boolean(state.hasAnyMute)}
          className={[
            styles.masterMuteClearBtn,
            state.hasAnyMute ? styles.tapBtnMute : styles.masterToolInactive,
          ]
            .filter(Boolean)
            .join(" ")}
          title={
            state.hasAnyMute
              ? "Włącz wszystkie wyciszone ścieżki (⌥M)"
              : "Brak aktywnych wyciszeń"
          }
          aria-label={
            state.hasAnyMute
              ? "Włącz wszystkie wyciszone ścieżki (⌥M)"
              : "Brak aktywnych wyciszeń"
          }
          disabled={!state.hasAnyMute}
          onClick={(e) => {
            e.stopPropagation();
            if (e.altKey || e.shiftKey) {
              callbacks.onClearAllSoloMute?.();
            } else {
              callbacks.onClearAllMute?.();
            }
          }}
        >
          M
        </Button>
      </div>

      <div
        className={[
          styles.mixerBanner,
          styles.mixerBannerAccent,
          styles.masterBanner,
        ].join(" ")}
      >
        <span className={styles.label}>Master</span>
      </div>
    </div>
  );
}
