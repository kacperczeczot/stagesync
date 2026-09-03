import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  LibrarySchema,
  ProjectSchema,
} from "@stagesync/shared";

async function listen(
  dataDir: string,
): Promise<{ server: Server; baseUrl: string }> {
  const { app } = createApp({ dataDir });
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

describe("library / import, export, batch-midi-pc", () => {
  let dataDir: string;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "stagesync-import-export-"));
    ({ server, baseUrl } = await listen(dataDir));
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await rm(dataDir, { recursive: true, force: true });
  });

  it("POST /api/library/import rejects 4.x songs[] JSON", async () => {
    const legacy = {
      schemaVersion: 4,
      songs: [
        {
          id: "song-legacy-1",
          title: "Legacy Import",
          tempo: 120,
          markers: [{ id: "mk-end", kind: "END", startAbs: 16 }],
          sections: [
            { id: 0, name: "Countdown", startAbs: 0 },
            { id: 1, name: "Verse", startAbs: 8 },
          ],
          chords: { timeSignature: "4/4", clips: [] },
        },
      ],
    };
    const res = await fetch(`${baseUrl}/api/library/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(legacy),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/tylko pakiet v5|projects/);
  });

  it("POST /api/library/import rejects unknown JSON", async () => {
    const res = await fetch(`${baseUrl}/api/library/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ foo: 1 }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Nieznany format|projects|pakiet v5/);
  });

  it("POST /api/library/import accepts v5 pack fixture", async () => {
    const { readFile } = await import("node:fs/promises");
    const { resolve, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const repoRoot = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../..",
    );
    const raw = JSON.parse(
      await readFile(
        join(repoRoot, "docs/examples/v5/library.pack.sample.stagesync.json"),
        "utf8",
      ),
    );
    const res = await fetch(`${baseUrl}/api/library/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(raw),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      ok: boolean;
      format: string;
      created: string[];
    };
    expect(body.ok).toBe(true);
    expect(body.format).toBe("v5-pack");
    expect(body.created).toHaveLength(1);
    const project = ProjectSchema.parse(
      await (await fetch(`${baseUrl}/api/projects/${body.created[0]}`)).json(),
    );
    expect(project.name).toBe("Pack Sample");
  });

  it("POST /api/library/export returns pack and filters by ids", async () => {
    const a = ProjectSchema.parse(
      await (
        await fetch(`${baseUrl}/api/projects`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Export A" }),
        })
      ).json(),
    );
    const b = ProjectSchema.parse(
      await (
        await fetch(`${baseUrl}/api/projects`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Export B" }),
        })
      ).json(),
    );

    const all = await fetch(`${baseUrl}/api/library/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(all.status).toBe(200);
    const packAll = (await all.json()) as {
      stagesyncExportVersion: number;
      projects: Array<{ id: string }>;
    };
    expect(packAll.stagesyncExportVersion).toBe(3);
    expect(packAll.projects.some((p) => p.id === a.id)).toBe(true);
    expect(packAll.projects.some((p) => p.id === b.id)).toBe(true);

    const one = await fetch(`${baseUrl}/api/library/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectIds: [a.id] }),
    });
    expect(one.status).toBe(200);
    const packOne = (await one.json()) as { projects: Array<{ id: string }> };
    expect(packOne.projects).toHaveLength(1);
    expect(packOne.projects[0]?.id).toBe(a.id);
  });

  it("POST /api/library/import rejects empty project list", async () => {
    const res = await fetch(`${baseUrl}/api/library/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stagesyncExportVersion: 3,
        exportedAt: new Date().toISOString(),
        projects: [],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/library/import rejects pack with only non-object projects", async () => {
    const res = await fetch(`${baseUrl}/api/library/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stagesyncExportVersion: 3,
        exportedAt: new Date().toISOString(),
        projects: [null, "skip", 3],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/library/batch-midi-pc assigns program ids", async () => {
    const created = ProjectSchema.parse(
      await (
        await fetch(`${baseUrl}/api/projects`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "PC Song" }),
        })
      ).json(),
    );
    const res = await fetch(`${baseUrl}/api/library/batch-midi-pc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        assignments: [{ id: created.id, midiProgramId: 42 }],
      }),
    });
    expect(res.status).toBe(200);
    const library = LibrarySchema.parse(await res.json());
    const entry = library.projects.find((p) => p.id === created.id);
    expect(entry?.midiProgramId).toBe(42);
  });

  it("POST /api/library/batch-midi-pc rejects out-of-range PC", async () => {
    const created = ProjectSchema.parse(
      await (
        await fetch(`${baseUrl}/api/projects`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Bad PC" }),
        })
      ).json(),
    );
    const res = await fetch(`${baseUrl}/api/library/batch-midi-pc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        assignments: [{ id: created.id, midiProgramId: 128 }],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/library/export rejects non-UUID projectIds", async () => {
    const res = await fetch(`${baseUrl}/api/library/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectIds: ["not-a-uuid"] }),
    });
    expect(res.status).toBe(400);
  });
});
