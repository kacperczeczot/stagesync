import { describe, expect, it } from "vitest";
import {
  extractAudioClipProperties,
  applyAudioClipProperties,
  type AudioClip,
  type Project,
} from "@stagesync/shared";
import { commitPasteAudioClipProperties } from "./audioClipOperations.js";

function seedClip(id: string, trackId = "t1"): AudioClip {
  return {
    id,
    trackId,
    assetId: "a1",
    startTicks: 0,
    lengthTicks: 1920,
    gainDb: 0,
    fadeInMs: 10,
    fadeOutMs: 20,
    loop: false,
    muted: false,
  };
}

describe("AudioClip properties paste", () => {
  it("extracts audio clip properties accurately", () => {
    const clip = seedClip("c1");
    clip.gainDb = -4.5;
    clip.fadeInMs = 150;
    clip.fadeOutMs = 300;
    clip.loop = true;
    clip.muted = true;
    clip.trimInMs = 50;
    clip.trimOutMs = 100;

    const props = extractAudioClipProperties(clip);
    expect(props).toEqual({
      gainDb: -4.5,
      fadeInMs: 150,
      fadeOutMs: 300,
      trimInMs: 50,
      trimOutMs: 100,
      loop: true,
      muted: true,
    });
  });

  it("applies audio clip properties to a target clip", () => {
    const source = seedClip("src");
    source.gainDb = -6;
    source.fadeInMs = 200;
    source.fadeOutMs = 400;
    source.loop = true;

    const target = seedClip("tgt");
    const updated = applyAudioClipProperties(
      target,
      extractAudioClipProperties(source),
    );

    expect(updated.gainDb).toBe(-6);
    expect(updated.fadeInMs).toBe(200);
    expect(updated.fadeOutMs).toBe(400);
    expect(updated.loop).toBe(true);
    expect(updated.id).toBe("tgt"); // Preserves clip identity
  });

  it("commitPasteAudioClipProperties applies properties to matching clips only", () => {
    const dummyProject: Project = {
      id: "p1",
      name: "Demo",
      formatVersion: 6,
      updatedAt: new Date().toISOString(),
      ppq: 960,
      defaultBpm: 120,
      defaultMeter: { numerator: 4, denominator: 4 },
      forma: { clips: [] },
      tempoMap: [],
      meterMap: [],
      keyMap: [],
      akordy: { clips: [] },
      cue: { clips: [] },
      tekst: { clips: [] },
      melody: { clips: [] },
      scoreBarMap: { anchors: [] },
      audioTracks: [{ id: "t1", name: "Track 1" }],
      audioClips: [seedClip("c1"), seedClip("c2"), seedClip("c3")],
      assets: [],
    };

    const props = { gainDb: -3, fadeInMs: 50, fadeOutMs: 100, loop: true };
    const next = commitPasteAudioClipProperties(
      dummyProject,
      ["c1", "c3"],
      props,
    );

    expect(next.audioClips[0]!.gainDb).toBe(-3);
    expect(next.audioClips[0]!.loop).toBe(true);
    expect(next.audioClips[1]!.gainDb).toBe(0); // Untouched
    expect(next.audioClips[2]!.gainDb).toBe(-3);
  });
});
