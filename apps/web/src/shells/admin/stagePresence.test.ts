import { describe, it, expect } from "vitest";
import {
  resolveClientPhase,
  presenceTitle,
  connectionStatusLabel,
  formatRoleLabels,
  formatSessionRoles,
  formatExpiresAt,
  CLIENT_STALE_MS,
  type PresenceClient,
  type SessionStageMessage,
} from "./stagePresence.js";

describe("stagePresence", () => {
  const now = 100000;

  it("resolves client phases correctly", () => {
    const staleClient: PresenceClient = {
      id: "c1",
      displayName: "iPad",
      roles: ["karaoke"],
      latencyMs: 10,
      connectedAt: now - 50000,
      updatedAt: now - CLIENT_STALE_MS - 1000,
    };
    expect(resolveClientPhase(staleClient, now)).toBe("stale");

    const noDataClient: PresenceClient = {
      id: "c2",
      displayName: "",
      roles: [],
      latencyMs: null,
      connectedAt: now - 10000,
      updatedAt: now - 1000,
    };
    expect(resolveClientPhase(noDataClient, now)).toBe("awaiting-data");

    const noRoleClient: PresenceClient = {
      id: "c3",
      displayName: "Tablet",
      roles: [],
      latencyMs: 20,
      connectedAt: now - 10000,
      updatedAt: now - 1000,
    };
    expect(resolveClientPhase(noRoleClient, now)).toBe("awaiting-role");

    const readyClient: PresenceClient = {
      id: "c4",
      displayName: "Stage Screen",
      roles: ["score"],
      latencyMs: 15,
      connectedAt: now - 10000,
      updatedAt: now - 1000,
    };
    expect(resolveClientPhase(readyClient, now)).toBe("ready");
  });

  it("provides human readable titles and status labels for phases", () => {
    expect(presenceTitle("stale")).toContain("brak świeżych danych");
    expect(connectionStatusLabel("ready")).toBe("Online");
    expect(connectionStatusLabel("stale")).toBe("Brak sygnału");
  });

  it("formats role labels and session roles", () => {
    expect(formatRoleLabels(["karaoke", "grid"])).toBe("Tekst, Akordy");
    expect(formatSessionRoles(undefined)).toBe("wszyscy");
    expect(formatSessionRoles(["score"])).toBe("Partytura");
  });

  it("formats expiresAt date correctly", () => {
    const msg: SessionStageMessage = {
      id: "m1",
      text: "Test message",
      ttlMs: 5000,
      sentAtMs: 1000,
      expiresAt: new Date("2026-08-12T20:00:00Z").toISOString(),
    };
    const formatted = formatExpiresAt(msg);
    expect(formatted).toContain("do ");
  });
});
