// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTimelineAudioUpload } from "./useTimelineAudioUpload.js";
import type { Project } from "@stagesync/shared";
import { uploadProjectAudio } from "@lib/shell-operator/projectAssetsApi.js";

vi.mock("@lib/shell-operator/projectAssetsApi.js", () => ({
  uploadProjectAudio: vi.fn(),
}));

vi.mock("@lib/audio/audioPlayback.js", () => ({
  loadAudioBuffer: vi.fn().mockResolvedValue({
    numberOfChannels: 2,
    duration: 10,
  }),
}));

describe("useTimelineAudioUpload", () => {
  const dummyProject: Project = {
    id: "p1",
    name: "Song",
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
    tekst: { clips: [] },
    melody: { clips: [] },
    cue: { clips: [] },
    scoreBarMap: { anchors: [] },
    audioTracks: [
      {
        id: "track-1",
        name: "Vocals",
        gainDb: 0,
        pan: 0,
        muted: false,
      },
    ],
    audioClips: [],
    assets: [
      {
        id: "asset-1",
        storageName: "vocals.wav",
        originalName: "vocals.wav",
        kind: "audio",
        mimeType: "audio/wav",
        sizeBytes: 1024,
        durationMs: 10000,
      },
    ],
  };

  it("uploads audio file to track and updates project state", async () => {
    const updatedProject: Project = {
      ...dummyProject,
      audioTracks: [
        {
          id: "track-1",
          name: "Vocals",
          gainDb: 0,
          pan: 0,
          muted: false,
        },
      ],
      audioClips: [
        {
          id: "clip-1",
          trackId: "track-1",
          assetId: "asset-1",
          startTicks: 0,
          lengthTicks: 3840,
        },
      ],
    };

    vi.mocked(uploadProjectAudio).mockResolvedValue(updatedProject);

    const setSavedProject = vi.fn();
    const setDraftProject = vi.fn();
    const setDraftHistory = vi.fn();
    const setTrackVisibility = vi.fn();
    const setLoadError = vi.fn();

    const { result } = renderHook(() =>
      useTimelineAudioUpload({
        projectId: "p1",
        draftProject: dummyProject,
        setSavedProject,
        setDraftProject,
        setDraftHistory,
        setTrackVisibility,
        setLoadError,
      }),
    );

    const fakeFile = new File(["dummy"], "vocals.wav", { type: "audio/wav" });

    await act(async () => {
      await result.current.onUploadAudioToTrack("track-1", fakeFile);
    });

    expect(uploadProjectAudio).toHaveBeenCalledWith("p1", fakeFile, {
      trackId: "track-1",
      startTicks: undefined,
    });
    expect(setDraftProject).toHaveBeenCalled();
  });

  it("preserves uncommitted draft edits in forma and existing audioTracks during upload", async () => {
    const serverProject: Project = {
      ...dummyProject,
      forma: { clips: [] },
      audioTracks: [
        {
          id: "track-1",
          name: "Vocals",
          gainDb: 0,
          pan: 0,
          muted: false,
        },
      ],
      audioClips: [
        {
          id: "clip-1",
          trackId: "track-1",
          assetId: "asset-1",
          startTicks: 0,
          lengthTicks: 3840,
        },
      ],
    };

    const dirtyDraft: Project = {
      ...dummyProject,
      forma: {
        clips: [
          {
            id: "f1",
            kind: "section",
            startTicks: 0,
            lengthTicks: 3840,
            name: "Chorus",
          },
        ],
      },
      audioTracks: [
        {
          id: "track-1",
          name: "Vocals",
          gainDb: -6, // uncommitted gain change
          pan: 0,
          muted: false,
        },
        {
          id: "track-local-2",
          name: "Drums",
          gainDb: 0,
          pan: 0,
          muted: false,
        },
      ],
    };

    vi.mocked(uploadProjectAudio).mockResolvedValue(serverProject);

    let savedState: Project | null = dummyProject;
    let draftState: Project | null = dirtyDraft;
    const setSavedProject = vi.fn((updater) => {
      savedState = typeof updater === "function" ? updater(savedState) : updater;
    });
    const setDraftProject = vi.fn((updater) => {
      draftState = typeof updater === "function" ? updater(draftState) : updater;
    });

    const { result } = renderHook(() =>
      useTimelineAudioUpload({
        projectId: "p1",
        draftProject: dirtyDraft,
        setSavedProject,
        setDraftProject,
        setDraftHistory: vi.fn(),
        setTrackVisibility: vi.fn(),
        setLoadError: vi.fn(),
      }),
    );

    const fakeFile = new File(["dummy"], "vocals.wav", { type: "audio/wav" });

    await act(async () => {
      await result.current.onUploadAudioToTrack("track-1", fakeFile);
    });

    expect(draftState?.forma.clips).toHaveLength(1);
    expect(draftState?.forma.clips[0]?.name).toBe("Chorus");
    expect(draftState?.audioTracks).toHaveLength(2);
    expect(draftState?.audioTracks.find((t) => t.id === "track-1")?.gainDb).toBe(-6);
    expect(draftState?.audioClips).toHaveLength(1);
    // Saved state still has empty forma so dirty flag remains true
    expect(savedState?.forma.clips).toHaveLength(0);
  });
});
