import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTimelineNavUrl, getAdminNavUrl, getClientNavUrl } from "./operatorNavRoutes.js";
import { getLastTimelineProjectId } from "@lib/client/lastTimelineProject.js";

vi.mock("@lib/client/lastTimelineProject.js", () => ({
  getLastTimelineProjectId: vi.fn(),
}));

describe("operatorNavRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns /timeline/:id when a last timeline project exists", () => {
    vi.mocked(getLastTimelineProjectId).mockReturnValue("project-abc");
    expect(getTimelineNavUrl()).toBe("/timeline/project-abc");
  });

  it("returns /timeline when no last timeline project exists", () => {
    vi.mocked(getLastTimelineProjectId).mockReturnValue(null);
    expect(getTimelineNavUrl()).toBe("/timeline");
  });

  it("returns admin and client nav urls correctly", () => {
    expect(getAdminNavUrl()).toBe("/admin");
    expect(getAdminNavUrl("host")).toBe("/admin?section=host");
    expect(getClientNavUrl()).toBe("/client");
  });
});
