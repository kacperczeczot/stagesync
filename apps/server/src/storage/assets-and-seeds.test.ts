import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectV5Seed } from "@stagesync/shared";
import { NotFoundError, StorageError, createStores } from "./index.js";

const fsHooks = vi.hoisted(() => ({
  access: null as null | ((path: string) => Promise<void>),
  unlink: null as null | ((path: string) => Promise<void>),
  rm: null as null | ((path: string) => Promise<void>),
  readFile: null as null | ((path: string) => Promise<string>),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    access: async (
      path: Parameters<typeof actual.access>[0],
      mode?: Parameters<typeof actual.access>[1],
    ) => {
      if (fsHooks.access) return fsHooks.access(String(path));
      return actual.access(path, mode);
    },
    unlink: async (path: Parameters<typeof actual.unlink>[0]) => {
      if (fsHooks.unlink) return fsHooks.unlink(String(path));
      return actual.unlink(path);
    },
    rm: async (
      path: Parameters<typeof actual.rm>[0],
      opts?: Parameters<typeof actual.rm>[1],
    ) => {
      if (fsHooks.rm) return fsHooks.rm(String(path));
      return actual.rm(path, opts);
    },
    readFile: async (
      path: Parameters<typeof actual.readFile>[0],
      opts?: Parameters<typeof actual.readFile>[1],
    ) => {
      if (fsHooks.readFile) return fsHooks.readFile(String(path));
      return actual.readFile(path, opts as never);
    },
  };
});

describe("storage/assets-and-seeds", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    fsHooks.access = null;
    fsHooks.unlink = null;
    fsHooks.rm = null;
    fsHooks.readFile = null;
    await Promise.all(
      dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
    );
  });

  async function tmpData(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "ss-store-"));
    dirs.push(dir);
    return dir;
  }

  async function writeLib(dataDir: string, library: unknown): Promise<void> {
    await mkdir(join(dataDir, "library"), { recursive: true });
    await writeFile(
      join(dataDir, "library", "library.json"),
      JSON.stringify(library),
    );
  }

  async function writeProjectFile(
    dataDir: string,
    id: string,
    raw: unknown,
  ): Promise<void> {
    const dir = join(dataDir, "projects", id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "project.json"), JSON.stringify(raw));
  }

  it("materializeSeedProjects skips missing seeds and maps access errors", async () => {
    const dataDir = await tmpData();
    const validSeedId = "00000000-0000-4000-8000-00000000c0de";
    await writeLib(dataDir, {
      version: 1,
      projects: [
        {
          id: validSeedId,
          name: "Seeded",
          updatedAt: "2026-07-21T00:00:00.000Z",
          isTemplate: true,
        },
      ],
    });
    const stores = createStores(dataDir);
    await expect(stores.getLibrary()).resolves.toBeTruthy();

    fsHooks.access = async () => {
      throw Object.assign(new Error("EACCES"), { code: "EACCES" });
    };
    await expect(stores.getLibrary()).rejects.toBeInstanceOf(StorageError);
    fsHooks.access = null;

    const seedDir = await mkdtemp(join(tmpdir(), "ss-seed-bad-"));
    dirs.push(seedDir);
    await mkdir(join(seedDir, "seed-projects", validSeedId), {
      recursive: true,
    });
    await writeFile(
      join(seedDir, "seed-projects", validSeedId, "project.json"),
      "{not-json",
    );
    await writeFile(
      join(seedDir, "library.template.json"),
      JSON.stringify({
        version: 1,
        projects: [
          {
            id: validSeedId,
            name: "Seeded",
            updatedAt: "2026-07-21T00:00:00.000Z",
            isTemplate: true,
          },
        ],
      }),
    );
    const dataDir2 = await tmpData();
    const prev = process.env.STAGESYNC_SEED_DIR;
    process.env.STAGESYNC_SEED_DIR = seedDir;
    try {
      await writeLib(dataDir2, {
        version: 1,
        projects: [
          {
            id: validSeedId,
            name: "Seeded",
            updatedAt: "2026-07-21T00:00:00.000Z",
            isTemplate: true,
          },
        ],
      });
      await expect(createStores(dataDir2).getLibrary()).rejects.toBeInstanceOf(
        StorageError,
      );
    } finally {
      if (prev === undefined) delete process.env.STAGESYNC_SEED_DIR;
      else process.env.STAGESYNC_SEED_DIR = prev;
    }
  });

  it("asset helpers including clip creation and musicxml", async () => {
    const dataDir = await tmpData();
    const stores = createStores(dataDir);
    const project = await stores.createProject("Assets");

    const audio = await stores.addProjectAsset(
      project.id,
      {
        id: "asset-audio",
        kind: "audio",
        originalName: "a.wav",
        storageName: "a.wav",
        mimeType: "audio/wav",
        sizeBytes: 3,
      },
      Buffer.from([1, 2, 3]),
    );
    expect(audio.audioTracks.length).toBeGreaterThanOrEqual(1);
    expect(audio.audioClips.length).toBeGreaterThanOrEqual(1);
    expect(audio.audioClips[0]!.startTicks).toBe(0);

    const atBeat = await stores.addProjectAsset(
      audio.id,
      {
        id: "asset-audio-2",
        kind: "audio",
        originalName: "b.wav",
        storageName: "b.wav",
        mimeType: "audio/wav",
        sizeBytes: 3,
      },
      Buffer.from([4, 5, 6]),
      {
        audioTrackId: audio.audioTracks[0]!.id,
        startTicks: 1920,
      },
    );
    const placed = atBeat.audioClips.find((c) => c.assetId === "asset-audio-2");
    expect(placed?.startTicks).toBe(1920);

    const onSecondTrack = await stores.addProjectAsset(
      audio.id,
      {
        id: "asset-audio-3",
        kind: "audio",
        originalName: "c.wav",
        storageName: "c.wav",
        mimeType: "audio/wav",
        sizeBytes: 3,
      },
      Buffer.from([7, 8, 9]),
      {
        audioTrackId: "track-second",
        startTicks: 0,
      },
    );
    const placed3 = onSecondTrack.audioClips.find(
      (c) => c.assetId === "asset-audio-3",
    );
    expect(placed3?.trackId).toBe("track-second");
    expect(onSecondTrack.audioTracks.some((t) => t.id === "track-second")).toBe(
      true,
    );

    const withXml = await stores.addProjectAsset(
      audio.id,
      {
        id: "asset-xml",
        kind: "musicxml",
        originalName: "score.musicxml",
        storageName: "score.musicxml",
        mimeType: "application/vnd.recordare.musicxml+xml",
        sizeBytes: 2,
      },
      Buffer.from("<xml/>"),
      { createAudioClip: false },
    );
    expect(
      (await stores.getLibrary()).projects.find((p) => p.id === project.id)
        ?.hasMusicXml,
    ).toBe(true);

    expect(
      (await stores.getAssetFilePath(project.id, "asset-audio")).path,
    ).toContain("a.wav");
    await expect(
      stores.getAssetFilePath(project.id, "missing"),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      stores.deleteProjectAsset(project.id, "missing"),
    ).rejects.toBeInstanceOf(NotFoundError);

    fsHooks.unlink = async () => {
      throw Object.assign(new Error("EPERM"), { code: "EPERM" });
    };
    await expect(
      stores.deleteProjectAsset(project.id, "asset-xml"),
    ).rejects.toBeInstanceOf(StorageError);
    fsHooks.unlink = async () => {
      throw Object.assign(new Error("gone"), { code: "ENOENT" });
    };
    expect(
      (await stores.deleteProjectAsset(project.id, "asset-xml")).assets.some(
        (a) => a.id === "asset-xml",
      ),
    ).toBe(false);
    void withXml;
  });

  it("rejects create when no free MIDI program remains", async () => {
    const dataDir = await tmpData();
    const tplId = "00000000-0000-4000-8000-00000000ffff";
    const ids = Array.from({ length: 128 }, (_, i) => {
      const hex = i.toString(16).padStart(12, "0");
      return `10000000-0000-4000-8000-${hex}`;
    });
    await writeLib(dataDir, {
      version: 1,
      projects: [
        {
          id: tplId,
          name: "Template",
          updatedAt: "2026-07-21T00:00:00.000Z",
          isTemplate: true,
        },
        ...ids.map((id, i) => ({
          id,
          name: `P${i}`,
          updatedAt: "2026-07-21T00:00:00.000Z",
          midiProgramId: i,
        })),
      ],
    });
    await writeProjectFile(
      dataDir,
      tplId,
      createProjectV5Seed(tplId, "Template", "2026-07-21T00:00:00.000Z", {
        isTemplate: true,
      }),
    );
    for (let i = 0; i < 128; i++) {
      await writeProjectFile(
        dataDir,
        ids[i]!,
        createProjectV5Seed(ids[i]!, `P${i}`, "2026-07-21T00:00:00.000Z", {
          midiProgramId: i,
        }),
      );
    }
    await expect(
      createStores(dataDir).createProject("Overflow", {
        fromTemplateId: tplId,
      }),
    ).rejects.toThrow(/No free MIDI/);
  });

  it("readProjectRaw maps ENOENT and non-ENOENT during migrate", async () => {
    const dataDir = await tmpData();
    const stores = createStores(dataDir);
    await stores.getLibrary();
    await expect(
      stores.migrateProjectOnDisk("00000000-0000-4000-8000-00000000a155"),
    ).rejects.toBeInstanceOf(NotFoundError);

    const song = await stores.createProject("Raw");
    fsHooks.readFile = async (path) => {
      if (path.endsWith("project.json")) {
        throw Object.assign(new Error("EACCES"), { code: "EACCES" });
      }
      return readFile(path, "utf8");
    };
    await expect(stores.migrateProjectOnDisk(song.id)).rejects.toBeInstanceOf(
      StorageError,
    );
  });
});
