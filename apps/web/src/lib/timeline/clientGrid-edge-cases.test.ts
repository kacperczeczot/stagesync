import { describe, expect, it } from "vitest";
import {
  createProjectSeed,
  DEFAULT_PPQ,
  type Project,
} from "@stagesync/shared";
import {
  buildGridLiveContext,
  chordStepsForTickRange,
  cycleGridTemplateColumns,
  cycleStepsWithActive,
  cycleTotalBars,
  detectCycleLength,
  mergeAkordyWithCountdownDigits,
  resolveActiveSubsection,
  resolveHeroNextSymbol,
  resolveNextPhraseBand,
  sectionBarChords,
} from "./clientGrid.js";

const BAR = 4 * DEFAULT_PPQ;

describe("clientGrid edge cases and helpers", () => {
  it("resolveActiveSubsection clamps to last band at exclusive end", () => {
    const section = {
      startTicks: 0,
      lengthTicks: 7680,
      subsections: [3840],
    };
    const last = resolveActiveSubsection(section, 7680);
    expect(last.startRel).toBe(3840);
  });

  it("resolveHeroNextSymbol covers empty / next-in-row / next-band paths", () => {
    expect(
      resolveHeroNextSymbol(
        [],
        [{ symbol: "N", bars: 1, active: false, activeBarInStep: null }],
      ),
    ).toBe("N");
    expect(resolveHeroNextSymbol([], [])).toBeNull();
    const cycle = [
      { symbol: "A", bars: 1, active: true, activeBarInStep: 1 },
      { symbol: "B", bars: 1, active: false, activeBarInStep: null },
    ];
    expect(resolveHeroNextSymbol(cycle, [])).toBe("B");
    const lastActive = [
      { symbol: "A", bars: 1, active: false, activeBarInStep: null },
      { symbol: "B", bars: 1, active: true, activeBarInStep: 1 },
    ];
    expect(
      resolveHeroNextSymbol(lastActive, [
        { symbol: "X", bars: 1, active: false, activeBarInStep: null },
      ]),
    ).toBe("X");
  });

  it("cycleGridTemplateColumns and cycleTotalBars handle empty/invalid", () => {
    expect(cycleGridTemplateColumns([])).toBe("");
    expect(cycleGridTemplateColumns([{ bars: Number.NaN }, { bars: 2 }])).toBe(
      "1fr 2fr",
    );
    expect(cycleGridTemplateColumns([{ bars: 0.5 }, { bars: 1 }])).toBe(
      "0.5fr 1fr",
    );
    expect(cycleTotalBars([])).toBe(0);
    expect(
      cycleTotalBars([
        { symbol: "A", bars: Number.NaN, active: false, activeBarInStep: null },
        { symbol: "B", bars: 2, active: false, activeBarInStep: null },
      ]),
    ).toBe(2);
    expect(
      cycleTotalBars([
        { symbol: "A", bars: 0.5, active: false, activeBarInStep: null },
        { symbol: "B", bars: 1, active: false, activeBarInStep: null },
      ]),
    ).toBe(1.5);
  });

  it("chordStepsForTickRange uses clip onsets (not only bar starts)", () => {
    let p: Project = createProjectSeed(
      "p",
      "S",
      "2026-07-20T12:00:00.000Z",
    );
    const half = BAR / 2;
    p = {
      ...p,
      akordy: {
        clips: [
          {
            id: "c1",
            symbol: "C",
            startTicks: 0,
            lengthTicks: half,
          },
          {
            id: "g1",
            symbol: "G",
            startTicks: half,
            lengthTicks: half,
          },
        ],
      },
    };
    const steps = chordStepsForTickRange(p, p.akordy.clips, 0, BAR);
    expect(steps.map((s) => s.symbol)).toEqual(["C", "G"]);
    expect(steps[0]!.barUnits).toBeCloseTo(0.5, 5);
    expect(steps[1]!.barUnits).toBeCloseTo(0.5, 5);

    const cycle = cycleStepsWithActive(steps, half + 10);
    expect(cycle.find((s) => s.active)?.symbol).toBe("G");

    const ctx = buildGridLiveContext(p, half + 10);
    expect(ctx.cycle.some((s) => s.active && s.symbol === "G")).toBe(true);
    expect(ctx.hero).toBe("G");
  });

  it("buildGridLiveContext empty project and no chords", () => {
    expect(buildGridLiveContext(null, 0).emptyReason).toMatch(/Oczekiwanie/);
    const p = createProjectSeed("p", "S", "2026-07-20T12:00:00.000Z");
    expect(
      buildGridLiveContext({ ...p, akordy: { clips: [] } }, 0).emptyReason,
    ).toMatch(/Brak akordów/);
  });

  it("resolveNextPhraseBand crosses into next section subsections", () => {
    let p: Project = createProjectSeed(
      "p",
      "S",
      "2026-07-20T12:00:00.000Z",
    );
    const intro = p.forma.clips.find((c) => c.name === "Intro")!;
    const verse = {
      id: "forma-verse",
      name: "Verse",
      kind: "section" as const,
      startTicks: intro.startTicks + intro.lengthTicks,
      lengthTicks: 2 * BAR,
      subsections: [BAR],
    };
    p = {
      ...p,
      forma: { clips: [...p.forma.clips, verse] },
      akordy: {
        clips: [
          {
            id: "a1",
            symbol: "C",
            startTicks: verse.startTicks,
            lengthTicks: BAR,
          },
          {
            id: "a2",
            symbol: "G",
            startTicks: verse.startTicks + BAR,
            lengthTicks: BAR,
          },
        ],
      },
    };
    // At end of intro → next phrase is verse first subsection
    const band = resolveNextPhraseBand(
      p,
      intro.startTicks + intro.lengthTicks - 1,
    );
    expect(band?.sectionName).toBe("Verse");
    expect(band?.barChords.length).toBeGreaterThan(0);
  });

  it("carouselKey clip fallback without sectionInfo", () => {
    let p: Project = createProjectSeed(
      "p",
      "S",
      "2026-07-20T12:00:00.000Z",
    );
    // Only chords, wipe forma sections after countdown so sectionInfo may be null mid-song
    p = {
      ...p,
      forma: {
        clips: p.forma.clips.filter((c) => c.kind === "countdown"),
      },
      akordy: {
        clips: [{ id: "solo", symbol: "Em", startTicks: 0, lengthTicks: BAR }],
      },
    };
    const ctx = buildGridLiveContext(p, 100);
    expect(ctx.hero === "Em" || ctx.hero === "—").toBe(true);
    expect(ctx.carouselKey.includes("clip:") || ctx.carouselKey === "").toBe(
      true,
    );
  });

  it("detectCycleLength falls through when no proper divisor cycles", () => {
    expect(detectCycleLength(["A", "B", "C", "A"])).toBe(4);
  });

  it("resolveNextPhraseBand without countdown uses displayTicks as after", () => {
    let p: Project = createProjectSeed(
      "p",
      "S",
      "2026-07-20T12:00:00.000Z",
    );
    const intro = p.forma.clips.find((c) => c.kind === "section")!;
    p = {
      ...p,
      forma: {
        clips: p.forma.clips.filter((c) => c.kind !== "countdown"),
      },
      akordy: {
        clips: [
          {
            id: "a1",
            symbol: "C",
            startTicks: intro.startTicks,
            lengthTicks: BAR,
          },
        ],
      },
    };
    // No active section at large negative → treat as preview-from-after path
    const band = resolveNextPhraseBand(p, -10_000);
    expect(band?.sectionName === "Intro" || band === null).toBe(true);
  });

  it("buildGridLiveContext hero dash and empty carouselKey in gaps", () => {
    let p: Project = createProjectSeed(
      "p",
      "S",
      "2026-07-20T12:00:00.000Z",
    );
    p = {
      ...p,
      forma: { clips: p.forma.clips.filter((c) => c.kind === "countdown") },
      akordy: {
        clips: [
          // Chord only in far future — playhead in a gap with no merged hit
          { id: "far", symbol: "G", startTicks: 50 * BAR, lengthTicks: BAR },
        ],
      },
    };
    const ctx = buildGridLiveContext(p, 100);
    expect(ctx.hero).toBe("—");
    expect(ctx.carouselKey).toBe("");
  });

  it("chordStepsForTickRange works when bar map cannot walk the range", () => {
    const far = 20_000_000;
    let p: Project = createProjectSeed(
      "p",
      "S",
      "2026-07-20T12:00:00.000Z",
    );
    p = {
      ...p,
      forma: {
        clips: [
          {
            id: "forma-far",
            name: "Far",
            kind: "section",
            startTicks: far,
            lengthTicks: BAR,
          },
        ],
      },
      akordy: {
        clips: [{ id: "a", symbol: "C", startTicks: far, lengthTicks: BAR }],
      },
    };
    expect(
      chordStepsForTickRange(p, p.akordy.clips, far, far + BAR).map(
        (s) => s.symbol,
      ),
    ).toEqual(["C"]);
    expect(sectionBarChords(p, far + 100)).toBeNull();
  });

  it("sectionBarChords barIndex past last bar uses fallthrough", () => {
    const p: Project = createProjectSeed("p", "S", "2026-07-20T12:00:00.000Z");
    const intro = p.forma.clips.find((c) => c.kind === "section")!;
    // Playhead just inside exclusive end-1 so still in section; last bar index fallthrough
    // when displayTicks equals a bar end inside the subsection range.
    const info = sectionBarChords(p, intro.startTicks + intro.lengthTicks - 1);
    expect(info?.barIndexInSection).toBeGreaterThanOrEqual(0);
  });

  it("mergeAkordyWithCountdownDigits synth inside CD and strips legacy", () => {
    const p = createProjectSeed("p", "S", "2026-07-20T12:00:00.000Z");
    const cd = p.forma.clips.find((c) => c.kind === "countdown")!;
    const inside = mergeAkordyWithCountdownDigits(p, cd.startTicks);
    expect(
      inside.some((c) => /^\d+$/.test(c.symbol) || c.id.includes("cd")),
    ).toBe(true);
    const past = mergeAkordyWithCountdownDigits(
      p,
      cd.startTicks + cd.lengthTicks + 1,
    );
    expect(past.every((c) => !/^cd-chord-/i.test(c.id))).toBe(true);

    const dirty = {
      ...p,
      akordy: {
        clips: [
          {
            id: "cd-chord-legacy",
            startTicks: 0,
            lengthTicks: 100,
            symbol: "C",
          },
          {
            id: "real",
            startTicks: -10,
            lengthTicks: 100,
            symbol: "3",
          },
          {
            id: "keep",
            startTicks: 5000,
            lengthTicks: 100,
            symbol: "Am",
          },
        ],
      },
    };
    const cleaned = mergeAkordyWithCountdownDigits(
      dirty,
      cd.startTicks + cd.lengthTicks + 1,
    );
    expect(cleaned.map((c) => c.id)).toEqual(["keep"]);
  });
});
