import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apkDownloadUrl,
  apkDownloadUrlsFromJoin,
  apkSameOriginProbeUrl,
  browseServerPath,
  downloadDiagnosticsExport,
  fetchHostUpdateStatus,
  mdnsJoinUrl,
  networkDisplayUrls,
  pickPrimaryJoinUrl,
  postApplyHostUpdate,
  postSystemRestart,
  postSystemShutdown,
  probeApkAvailable,
} from "./setlistApi.js";

function okJson(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => data,
    headers: new Headers(),
    blob: async () => new Blob(),
  };
}

describe("systemHostApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("downloadDiagnosticsExport clicks anchor with disposition filename", async () => {
    const click = vi.fn();
    const remove = vi.fn();
    const appendChild = vi.fn((node: unknown) => node);
    const anchor = {
      href: "",
      download: "",
      rel: "",
      click,
      remove,
    };
    vi.stubGlobal("document", {
      createElement: (tag: string) => {
        if (tag === "a") return anchor;
        throw new Error(`unexpected element ${tag}`);
      },
      body: { appendChild },
    });
    const createObjectURL = vi.fn(() => "blob:diag");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          "content-disposition": 'attachment; filename="diag.zip"',
        }),
        json: async () => ({}),
        blob: async () => new Blob(["z"]),
      }),
    );

    await downloadDiagnosticsExport();
    expect(createObjectURL).toHaveBeenCalled();
    expect(anchor.download).toBe("diag.zip");
    expect(click).toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:diag");

    // fallback filename when disposition missing
    const a2 = {
      href: "",
      download: "",
      rel: "",
      click: vi.fn(),
      remove: vi.fn(),
    };
    vi.stubGlobal("document", {
      createElement: () => a2,
      body: { appendChild: vi.fn((n: unknown) => n) },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        blob: async () => new Blob(["z"]),
      }),
    );
    await downloadDiagnosticsExport();
    expect(a2.download).toMatch(/^stagesync-diagnostics-/);
  });

  it("host lifecycle endpoints + browse + update status", async () => {
    const store = new Map([["stagesync.hostToken", " tok "]]);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
    });
    const browse = {
      path: "/data",
      envPath: "DATA",
      parent: null,
      parentEnvPath: null,
      canSelectCurrent: true,
      entries: [],
    };
    const update = {
      current: "5.0.0",
      latest: "5.0.1",
      updateAvailable: true,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okJson({}))
      .mockResolvedValueOnce(okJson({}))
      .mockResolvedValueOnce(okJson(browse))
      .mockResolvedValueOnce(okJson(browse))
      .mockResolvedValueOnce(okJson(update))
      .mockResolvedValueOnce(okJson({}));
    vi.stubGlobal("fetch", fetchMock);

    await postSystemRestart();
    await postSystemShutdown();
    await browseServerPath({ path: "/tmp", mode: "file", ext: ".env" });
    await browseServerPath({});
    await expect(fetchHostUpdateStatus()).resolves.toEqual(update);
    await postApplyHostUpdate();

    expect(fetchMock.mock.calls[0]![0]).toBe("/api/system/restart");
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/system/shutdown");
    expect(String(fetchMock.mock.calls[2]![0])).toContain("mode=file");
    expect(String(fetchMock.mock.calls[2]![0])).toContain("ext=.env");
    expect(String(fetchMock.mock.calls[3]![0])).toContain("mode=dir");
    expect(fetchMock.mock.calls[4]![0]).toBe("/api/system/update-status");
    expect(fetchMock.mock.calls[5]![0]).toBe("/api/system/apply-update");
  });

  it("hostLifecycleHeaders tolerates localStorage throw", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(okJson({}));
    vi.stubGlobal("fetch", fetchMock);
    await postSystemRestart();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({});
  });

  it("pickPrimaryJoinUrl prefers LAN then non-loopback URL", () => {
    expect(
      pickPrimaryJoinUrl({
        port: 4000,
        hostname: "x",
        lanAddresses: ["10.0.0.2"],
        urls: ["http://127.0.0.1:4000"],
        version: "5",
      }),
    ).toBe("http://10.0.0.2:4000");

    expect(
      pickPrimaryJoinUrl({
        port: 4000,
        hostname: "x",
        lanAddresses: [],
        urls: ["http://127.0.0.1:4000", "http://stage.local:4000"],
        version: "5",
      }),
    ).toBe("http://stage.local:4000");

    expect(
      pickPrimaryJoinUrl({
        port: 4000,
        hostname: "x",
        lanAddresses: [],
        urls: ["http://127.0.0.1:4000"],
        version: "5",
      }),
    ).toBe("http://127.0.0.1:4000");

    expect(
      pickPrimaryJoinUrl({
        port: 4000,
        hostname: "x",
        lanAddresses: [],
        urls: [],
        version: "5",
      }),
    ).toBeNull();

    expect(
      pickPrimaryJoinUrl({
        port: 4000,
        hostname: "x",
        lanAddresses: [],
        urls: ["not a url", "http://ok.example:4000"],
        version: "5",
      }),
    ).toBe("http://ok.example:4000");
  });

  it("mdnsJoinUrl and networkDisplayUrls fail soft without inventing names", () => {
    expect(
      mdnsJoinUrl({
        port: 4000,
        hostname: "Studio-Mac",
        lanAddresses: ["10.0.0.1"],
        urls: ["http://10.0.0.1:4000", "http://localhost:4000"],
        version: "5",
        mdnsEnabled: true,
      }),
    ).toBe("http://Studio-Mac.local:4000");

    expect(
      mdnsJoinUrl({
        port: 4000,
        hostname: "localhost",
        lanAddresses: [],
        urls: ["http://localhost:4000"],
        version: "5",
        mdnsEnabled: true,
      }),
    ).toBeNull();

    expect(
      mdnsJoinUrl({
        port: 4000,
        hostname: "Studio-Mac",
        lanAddresses: [],
        urls: [],
        version: "5",
        mdnsEnabled: false,
      }),
    ).toBeNull();

    expect(
      networkDisplayUrls({
        port: 4000,
        hostname: "Studio-Mac",
        lanAddresses: ["10.0.0.1"],
        urls: ["http://10.0.0.1:4000", "http://localhost:4000"],
        version: "5",
        mdnsEnabled: true,
      }),
    ).toEqual([
      "http://10.0.0.1:4000",
      "http://Studio-Mac.local:4000",
      "http://localhost:4000",
    ]);
  });

  it("apkDownloadUrl and apkDownloadUrlsFromJoin build host download paths", () => {
    expect(apkDownloadUrl("http://10.0.0.2:4000", "performer")).toBe(
      "http://10.0.0.2:4000/downloads/stagesync-performer.apk",
    );
    expect(apkDownloadUrl("http://10.0.0.2:4000/", "console")).toBe(
      "http://10.0.0.2:4000/downloads/stagesync-console.apk",
    );
    expect(apkDownloadUrlsFromJoin("http://192.168.1.5:4000/admin")).toEqual({
      performer: "http://192.168.1.5:4000/downloads/stagesync-performer.apk",
      console: "http://192.168.1.5:4000/downloads/stagesync-console.apk",
    });
    expect(apkDownloadUrlsFromJoin("not-a-url")).toBeNull();
  });

  it("apkSameOriginProbeUrl rewrites LAN download URLs to pathname", () => {
    expect(
      apkSameOriginProbeUrl(
        "http://192.168.0.22:4000/downloads/stagesync-performer.apk",
      ),
    ).toBe("/downloads/stagesync-performer.apk");
    expect(
      apkSameOriginProbeUrl(
        "http://10.0.0.1:4000/downloads/stagesync-console.apk",
      ),
    ).toBe("/downloads/stagesync-console.apk");
    expect(apkSameOriginProbeUrl("/downloads/stagesync-performer.apk")).toBe(
      "/downloads/stagesync-performer.apk",
    );
    expect(apkSameOriginProbeUrl("http://example.com/other")).toBe(
      "http://example.com/other",
    );
  });

  it("probeApkAvailable is true only on ok HEAD (same-origin path)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      probeApkAvailable(
        "http://192.168.0.22:4000/downloads/stagesync-performer.apk",
      ),
    ).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/downloads/stagesync-performer.apk",
      expect.objectContaining({ method: "HEAD" }),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({ ok: false, status: 404 }),
    );
    await expect(
      probeApkAvailable("http://x/downloads/stagesync-performer.apk"),
    ).resolves.toBe(false);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("offline")));
    await expect(
      probeApkAvailable("http://x/downloads/stagesync-performer.apk"),
    ).resolves.toBe(false);
  });
});
