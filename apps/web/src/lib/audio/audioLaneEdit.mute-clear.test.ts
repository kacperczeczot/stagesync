import { describe, expect, it } from "vitest";
import type { Project } from "@stagesync/shared";
import { clearAllAudioMutes, hasAnyMutedTrackOrBus } from "./audioLaneEdit.js";
import { projectWithAudio } from "./audioLaneEdit.test-helpers.js";

describe("audioLaneEdit — Solo / Mute Off for All", () => {
  it("clearAllAudioMutes and hasAnyMutedTrackOrBus unmute tracks, busses, and hw outputs", () => {
    const p0 = projectWithAudio();
    expect(hasAnyMutedTrackOrBus(p0)).toBe(false);
    expect(clearAllAudioMutes(p0)).toBe(p0);

    const withMuted: Project = {
      ...p0,
      audioTracks: [{ ...p0.audioTracks[0]!, muted: true }],
      audioBusses: [{ id: "bus-1", name: "Reverb", muted: true }],
      audioHardwareOutputs: [
        {
          id: "hw-1",
          name: "IEM",
          channelOffset: 2,
          channelMode: "stereo",
          muted: true,
        },
      ],
    };

    expect(hasAnyMutedTrackOrBus(withMuted)).toBe(true);

    const unmuted = clearAllAudioMutes(withMuted);
    expect(hasAnyMutedTrackOrBus(unmuted)).toBe(false);
    expect(unmuted.audioTracks[0]!.muted).toBeUndefined();
    expect(unmuted.audioBusses![0]!.muted).toBeUndefined();
    expect(unmuted.audioHardwareOutputs![0]!.muted).toBeUndefined();
  });
});
