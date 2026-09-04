/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { createProjectSeed } from "@stagesync/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OPEN_PREFERENCES_EVENT } from "@lib/client/preferencesEvents.js";
import {
  shouldShowFullscreenControl,
  shouldShowOperatorNav,
} from "@lib/shell-operator/operatorSurface.js";
import { useMqMobileCompact } from "@lib/client/useMqMobileCompact.js";
import { ClientShell } from "./ClientShell.js";

vi.mock("@lib/client/desktopBridge.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@lib/client/desktopBridge.js")>();
  return {
    ...actual,
    toggleAppFullscreen: vi.fn(),
  };
});

vi.mock("@lib/client/nativeShell.js", () => ({
  canChangeServer: () => false,
  getStageSyncNative: () => null,
}));

vi.mock("@lib/shell-operator/operatorSurface.js", () => ({
  shouldShowOperatorNav: vi.fn(() => false),
  shouldShowFullscreenControl: vi.fn(() => false),
  isOsMenuDesktopShell: vi.fn(() => false),
}));

vi.mock("@lib/client/useMqMobileCompact.js", () => ({
  useMqMobileCompact: vi.fn(() => false),
}));

vi.mock("@lib/shell-operator/operatorNavShortcuts.js", () => ({
  useOperatorNavShortcuts: vi.fn(),
}));

vi.mock("@lib/client/lastTimelineProject.js", () => ({
  getLastTimelineProjectId: vi.fn(() => "proj-1"),
}));

vi.mock("@lib/client/screenWakeLock.js", () => ({
  requestScreenWakeLock: vi.fn(async () => null),
  releaseScreenWakeLock: vi.fn(async () => undefined),
}));

vi.mock("./ScorePane.js", () => ({
  ScorePane: () => <div data-testid="score-pane">score</div>,
}));

vi.mock("./KaraokePane.js", () => ({
  KaraokePane: () => <div data-testid="karaoke-pane">karaoke</div>,
}));

vi.mock("./GridPane.js", () => ({
  GridPane: () => <div data-testid="grid-pane">grid</div>,
}));

vi.mock("./DrumsPane.js", () => ({
  DrumsPane: () => <div data-testid="drums-pane">drums</div>,
}));

vi.mock("@lib/client/deviceNamePrefs.js", () => ({
  DEVICE_DISPLAY_NAME_CHANGED_EVENT: "stagesync:device-name",
  DEVICE_DISPLAY_NAME_MAX: 40,
  getStoredDeviceDisplayName: () => "Test Performer",
  setStoredDeviceDisplayName: (v: string) => v,
}));

const project = createProjectSeed(
  "song-1",
  "Test Song",
  "2026-07-25T00:00:00.000Z",
);
project.defaultBpm = 112;
project.tempoMap = [{ id: "tempo-0", startTicks: 0, bpm: 112 }];
project.keyMap = [
  { id: "k0", startTicks: 0, key: { tonic: "G", mode: "major" } },
];

vi.mock("@lib/shell-operator/useActiveProject.js", () => ({
  useActiveProject: () => ({
    activeProject: project,
    setActiveProject: vi.fn(),
    loading: false,
    reload: vi.fn(),
  }),
}));

vi.mock("../../transport/useTransport.js", () => ({
  useTransport: () => ({
    state: {
      playing: false,
      positionTicks: 0,
      bpm: 112,
      timeSignature: { numerator: 4, denominator: 4 },
      ppq: 960,
      activeProjectId: "song-1",
    },
    displayTicks: 0,
    wsStatus: "connected",
    latencyMs: 12,
    stageCues: [],
    liveDesk: {
      syncLeadMs: 0,
      transpositionSemitones: 0,
      clientEditEnabled: false,
    },
    setlistSnapshot: { projectIds: ["song-1", "song-2"], enabled: true },
    play: vi.fn(),
    seek: vi.fn(),
    setSoftClockTempoMaps: vi.fn(),
    commandPending: false,
    error: null,
    announcePresence: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(shouldShowOperatorNav).mockReturnValue(false);
  vi.mocked(useMqMobileCompact).mockReturnValue(false);
});

function startGridRole() {
  fireEvent.click(screen.getByRole("button", { name: /Akordy/i }));
  const start = screen.queryByRole("button", { name: /^Rozpocznij$/i });
  if (start) fireEvent.click(start);
}

function renderClient() {
  return render(
    <MemoryRouter initialEntries={["/client"]}>
      <ClientShell />
    </MemoryRouter>,
  );
}

describe("ClientShell chrome", () => {
  it("shows fullscreen control on web browser surface", () => {
    vi.mocked(shouldShowFullscreenControl).mockReturnValue(true);
    render(
      <MemoryRouter initialEntries={["/client"]}>
        <ClientShell />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("Pełny ekran")).toBeTruthy();
  });

  it("hides fullscreen control on Tauri / native shells", () => {
    vi.mocked(shouldShowFullscreenControl).mockReturnValue(false);
    render(
      <MemoryRouter initialEntries={["/client"]}>
        <ClientShell />
      </MemoryRouter>,
    );
    expect(screen.queryByLabelText("Pełny ekran")).toBeNull();
  });

  it("does not force Client 44px touch targets on the desktop page root", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "ClientShell.module.css"),
      "utf8",
    );
    const desktopPageBlock = css.match(/^\.page\s*\{([^}]*)\}/m)?.[1] ?? "";
    // Unconditional page override would make Desktop Client buttons 44px vs Admin 36px.
    expect(desktopPageBlock).not.toContain("--ss-touch-min-client");
    expect(css).toMatch(
      /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.page\s*\{[^}]*--ss-touch-min:\s*var\(--ss-touch-min-client\)/,
    );
  });

  it("matches AppHeader compact padding on mobile Client chrome", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "ClientShell.module.css"),
      "utf8",
    );
    const compactBlock =
      css.match(
        /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.headerCompact\s*\{([^}]*)\}/,
      )?.[1] ?? "";
    expect(compactBlock).toContain(
      "padding: var(--ss-space-1) var(--ss-space-2)",
    );
    expect(compactBlock).toContain(
      "padding-top: max(var(--ss-space-1), env(safe-area-inset-top, 0px))",
    );
    expect(compactBlock).toContain(
      "--ss-touch-min: var(--ss-touch-min-shell-action)",
    );
    expect(compactBlock).toContain(
      "var(--ss-touch-min-shell-action) + var(--ss-space-1)",
    );
    expect(compactBlock).not.toMatch(/\n\s*height:\s*calc\(/);
    expect(compactBlock).not.toMatch(/\bmax-height:/);
  });

  it("allocates vertical height budget for stacked OperatorNav + Client headerCompact", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "ClientShell.module.css"),
      "utf8",
    );

    const topChromeCompactBlock =
      css.match(
        /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.topChrome\s*\.headerCompact\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(topChromeCompactBlock).toContain(
      "var(--ss-touch-min-shell-action) + var(--ss-space-1) + var(--ss-space-1)",
    );
  });

  it("uses square desktop-sized role tiles on tablet (2×2, no viewport stretch)", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "ClientShell.module.css"),
      "utf8",
    );
    const tabletQuery = "@media (min-width: 641px) and (max-width: 1024px)";
    const tabletStart = css.indexOf(tabletQuery);
    expect(tabletStart).toBeGreaterThan(-1);
    const blockOpen = css.indexOf("{", tabletStart);
    let depth = 0;
    let tabletBlock = "";
    for (let i = blockOpen; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") {
        depth--;
        if (depth === 0) {
          tabletBlock = css.slice(blockOpen + 1, i);
          break;
        }
      }
    }
    expect(tabletBlock).toContain(
      "grid-template-columns: repeat(2, minmax(0, 1fr))",
    );
    expect(tabletBlock).not.toContain(
      "grid-template-columns: repeat(4, minmax(0, 1fr))",
    );
    expect(tabletBlock).toMatch(/\.roleTile\s*\{[^}]*aspect-ratio:\s*1/);
    expect(tabletBlock).toMatch(
      /\.roleGrid\s*\{[^}]*calc\(\(48rem - 3 \* var\(--ss-space-6\)\) \/ 2/,
    );
    expect(tabletBlock).not.toMatch(/\.roleGrid\s*\{[^}]*grid-template-rows:/);
    expect(tabletBlock).not.toMatch(/\.roleTile\s*\{[^}]*height:\s*100%/);
    expect(tabletBlock).not.toMatch(/\.roleIcon\s*\{[^}]*--ss-text-stage-2xl/);
    expect(tabletBlock).toMatch(/\.roleIcon\s*\{[^}]*--ss-text-3xl/);
    expect(tabletBlock).toMatch(/\.roleLabel\s*\{[^}]*--ss-text-xl/);
    expect(css).toMatch(
      /@media\s*\(min-width:\s*1025px\)\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/,
    );
    expect(css).not.toMatch(
      /@media\s*\(min-width:\s*768px\)\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4/,
    );
  });

  it("uses ShellIconButton (ss-btn--icon) for global settings chrome", () => {
    renderClient();
    const settings = screen.getByRole("button", {
      name: /Ustawienia globalne/i,
    });
    expect(settings.className).toContain("ss-btn");
    expect(settings.className).toContain("ss-btn--icon");
  });

  it("hides operator chrome without operator session", () => {
    vi.mocked(shouldShowOperatorNav).mockReturnValue(false);
    renderClient();
    expect(screen.queryByLabelText("Nawigacja operatora")).toBeNull();
    expect(screen.queryByLabelText("Aplikacje")).toBeNull();
    expect(
      screen.getByRole("button", { name: /Ustawienia globalne/i }),
    ).toBeTruthy();
  });

  it("shows Admin/Timeline app jump on tablet/desktop with operator session", () => {
    vi.mocked(shouldShowOperatorNav).mockReturnValue(true);
    vi.mocked(useMqMobileCompact).mockReturnValue(false);
    renderClient();
    expect(screen.queryByLabelText("Nawigacja operatora")).toBeNull();
    const apps = screen.getByLabelText("Aplikacje");
    expect(apps.textContent).toContain("Admin");
    expect(apps.textContent).toContain("Timeline");
    expect(
      screen.getByRole("button", { name: /Ustawienia globalne/i }),
    ).toBeTruthy();
  });

  it("keeps Client L1 header on Tauri desktop with operator jumps", () => {
    vi.mocked(shouldShowOperatorNav).mockReturnValue(true);
    vi.mocked(useMqMobileCompact).mockReturnValue(false);
    renderClient();
    expect(screen.getByLabelText("Aplikacje").textContent).toMatch(/Admin/);
    expect(screen.getByRole("banner")).toBeTruthy();
  });

  it("shows OperatorNav on compact mobile with operator session", () => {
    vi.mocked(shouldShowOperatorNav).mockReturnValue(true);
    vi.mocked(useMqMobileCompact).mockReturnValue(true);
    renderClient();
    expect(screen.getByLabelText("Nawigacja operatora")).toBeTruthy();
    expect(screen.getByLabelText("Aplikacje").textContent).toMatch(/Admin/);
    expect(screen.getByLabelText("Aplikacje").textContent).toMatch(/Klient/);
    // Settings live on OperatorNav — not a second gear in Client chrome.
    expect(
      screen.getAllByRole("button", { name: /Ustawienia globalne/i }),
    ).toHaveLength(1);
  });

  it("opens global settings from header gear without operator session", () => {
    vi.mocked(shouldShowOperatorNav).mockReturnValue(false);
    renderClient();
    fireEvent.click(
      screen.getByRole("button", { name: /Ustawienia globalne/i }),
    );
    const dialog = screen.getByRole("dialog", { name: /Ustawienia globalne/i });
    expect(dialog).toBeTruthy();
    expect(dialog.parentElement).toBe(document.body);
  });

  it("opens global settings from OperatorNav gear with operator session", () => {
    vi.mocked(shouldShowOperatorNav).mockReturnValue(true);
    vi.mocked(useMqMobileCompact).mockReturnValue(true);
    renderClient();
    fireEvent.click(
      screen.getByRole("button", { name: /Ustawienia globalne/i }),
    );
    const dialog = screen.getByRole("dialog", { name: /Ustawienia globalne/i });
    expect(dialog).toBeTruthy();
    // Portaled fixed-top-right — escapes Client `.page` overflow clipping.
    expect(dialog.parentElement).toBe(document.body);
  });

  it("does not dispatch openPreferences from Client global settings gear", () => {
    const onOpen = vi.fn();
    window.addEventListener(OPEN_PREFERENCES_EVENT, onOpen);
    renderClient();
    fireEvent.click(
      screen.getByRole("button", { name: /Ustawienia globalne/i }),
    );
    expect(onOpen).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: /Ustawienia globalne/i }),
    ).toBeTruthy();
    window.removeEventListener(OPEN_PREFERENCES_EVENT, onOpen);
  });

  it("does not expose setlist next/prev controls (read-only Client)", () => {
    renderClient();
    startGridRole();

    expect(
      screen.queryByRole("button", { name: /Następny utwór setlisty/i }),
    ).toBeNull();
    expect(screen.queryByText(/→następny/i)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Poprzedni utwór setlisty/i }),
    ).toBeNull();
  });

  it("renders metronome before song title in desktop Client header", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const tsx = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "ClientChrome.tsx"),
      "utf8",
    );
    const headerStart = tsx.indexOf("function ClientChrome");
    expect(headerStart).toBeGreaterThan(-1);
    const headerBlock = tsx.slice(headerStart, headerStart + 4000);
    const metronomePos = headerBlock.indexOf("className={styles.metronome}");
    const titlePos = headerBlock.indexOf("className={styles.songTitle}");
    expect(metronomePos).toBeGreaterThan(-1);
    expect(titlePos).toBeGreaterThan(-1);
    expect(metronomePos).toBeLessThan(titlePos);
  });

  it("shows song title in the header without key/tempo/meter/bar meta", () => {
    renderClient();

    expect(screen.getByText("Test Song")).toBeTruthy();
    expect(screen.queryByLabelText("Meta utworu")).toBeNull();
    expect(screen.queryByText("Tonacja")).toBeNull();
    expect(screen.queryByText("112 BPM")).toBeNull();
    expect(screen.queryByText("4/4")).toBeNull();

    startGridRole();

    expect(screen.getByText("Test Song")).toBeTruthy();
    expect(screen.queryByLabelText("Meta utworu")).toBeNull();
  });
});
