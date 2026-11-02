// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { TimelineShell } from "./TimelineShell.js";
import { useTimelineShellState } from "./hooks/useTimelineShellState.js";

vi.mock("./hooks/useTimelineShellState.js");

vi.mock("./components/TimelineAudioFileInput.js", () => ({
  TimelineAudioFileInput: () => <div data-testid="audio-file-input" />,
}));

vi.mock("./containers/TimelineHeaderContainer.js", () => ({
  TimelineHeaderContainer: () => <div data-testid="header-container" />,
}));

vi.mock("./containers/TimelineCanvasViewport.js", () => ({
  TimelineCanvasViewport: () => <div data-testid="canvas-viewport" />,
}));

vi.mock("./components/TimelineStatusFooter.js", () => ({
  TimelineStatusFooter: () => <div data-testid="status-footer" />,
}));

vi.mock("./containers/TimelineDialogsContainer.js", () => ({
  TimelineDialogsContainer: (props: { songScreenOpen?: boolean }) => (
    <div data-testid="dialogs-container" data-song-open={String(Boolean(props.songScreenOpen))} />
  ),
}));

describe("TimelineShell", () => {
  type ShellState = ReturnType<typeof useTimelineShellState>;

  it("renders loading state when loading and no draft project", () => {
    vi.mocked(useTimelineShellState).mockReturnValue({
      loading: true,
      draftProject: null,
      loadError: null,
    } as unknown as ShellState);

    render(
      <MemoryRouter>
        <TimelineShell />
      </MemoryRouter>,
    );

    expect(screen.getByText("Wczytywanie projektu…")).toBeTruthy();
  });

  it("renders error state when loadError exists and no draft project", () => {
    vi.mocked(useTimelineShellState).mockReturnValue({
      loading: false,
      draftProject: null,
      loadError: "Nie znaleziono projektu",
    } as unknown as ShellState);

    render(
      <MemoryRouter>
        <TimelineShell />
      </MemoryRouter>,
    );

    expect(screen.getByText("Nie znaleziono projektu")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Admin" })).toBeTruthy();
  });

  it("renders full shell and dialogs container when on /timeline without projectId", () => {
    vi.mocked(useTimelineShellState).mockReturnValue({
      projectId: undefined,
      loading: false,
      loadError: null,
      draftProject: null,
      rootClassName: "test-shell",
      touchTier: "desktop",
      touchPanAttr: undefined,
      headerContainerProps: {} as unknown as ShellState["headerContainerProps"],
      canvasViewportProps: {} as unknown as ShellState["canvasViewportProps"],
      dialogsContainerProps: {
        songScreenOpen: true,
      } as unknown as ShellState["dialogsContainerProps"],
    } as unknown as ShellState);

    render(
      <MemoryRouter>
        <TimelineShell />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("header-container")).toBeTruthy();
    expect(screen.getByTestId("canvas-viewport")).toBeTruthy();
    expect(screen.getByTestId("status-footer")).toBeTruthy();
    const dialogs = screen.getByTestId("dialogs-container");
    expect(dialogs).toBeTruthy();
    expect(dialogs.getAttribute("data-song-open")).toBe("true");
  });
});
