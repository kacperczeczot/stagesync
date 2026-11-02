/* @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DevPreviewApp } from "./DevPreviewApp.js";

function setPreviewSearch(search: string): void {
  window.history.replaceState({}, "", `/_dev/preview${search}`);
}

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  );
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DevPreviewApp", () => {
  it("renders timeline preview without nested Router errors", () => {
    setPreviewSearch("?surface=web&path=/timeline&projectId=dev-preview");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    expect(() => render(<DevPreviewApp />)).not.toThrow();

    const nestedRouterErrors = consoleError.mock.calls
      .flat()
      .filter((msg) => String(msg).includes("cannot render a <Router>"));
    expect(nestedRouterErrors).toHaveLength(0);
  });

  it("renders /client with session=1 and displays Admin and Timeline navigation buttons", () => {
    setPreviewSearch("?surface=web&path=/client&session=1&projectId=dev-preview");
    const { getByLabelText } = render(<DevPreviewApp />);
    const appNav = getByLabelText("Aplikacje");
    expect(appNav).toBeTruthy();
    expect(appNav.textContent).toContain("Admin");
    expect(appNav.textContent).toContain("Timeline");
  });

  it("renders /client with session=0 and hides Admin and Timeline navigation buttons", () => {
    setPreviewSearch("?surface=web&path=/client&session=0&projectId=dev-preview");
    const { queryByLabelText } = render(<DevPreviewApp />);
    expect(queryByLabelText("Aplikacje")).toBeNull();
  });

  it("renders /client on compact mobile with session=1 and displays OperatorNav with Admin and Timeline", () => {
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: query.includes("max-width: 640px"),
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    setPreviewSearch("?surface=web&path=/client&session=1&projectId=dev-preview");
    const { getByLabelText } = render(<DevPreviewApp />);
    const operatorNav = getByLabelText("Nawigacja operatora");
    expect(operatorNav).toBeTruthy();
    const appNav = getByLabelText("Aplikacje");
    expect(appNav.textContent).toContain("Admin");
    expect(appNav.textContent).toContain("Timeline");
  });
});
