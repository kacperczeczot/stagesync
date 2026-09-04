import { describe, expect, it } from "vitest";
import { placeContentFromForma } from "./wand.js";
import {
  BAR,
  barSpansFromStarts,
  makeTekstClip,
  sectionProject,
  withVerse,
} from "./wand.test-helpers.js";
import { createProjectSeed } from "../project/project-seed.js";

describe("placeContentFromForma", () => {
  it("8 bars / 4 lines → A even 2 bars", () => {
    const p = sectionProject(8, ["a", "b", "c", "d"]);
    const formaBefore = structuredClone(p.forma);
    const intro = p.forma.clips.find((c) => c.name === "Intro")!;
    const result = placeContentFromForma(p, "tekst");
    expect(result.ok).toBe(true);
    expect(result.project.forma).toEqual(formaBefore);
    const starts = result.project.tekst.clips
      .map((c) => c.startTicks)
      .sort((a, b) => a - b);
    expect(starts).toEqual([
      intro.startTicks,
      intro.startTicks + 2 * BAR,
      intro.startTicks + 4 * BAR,
      intro.startTicks + 6 * BAR,
    ]);
    expect(result.approximate).toBeFalsy();
  });

  it("7 bars / 4 lines → B remainder at end (1+2+2+2)", () => {
    const p = sectionProject(7, ["a", "b", "c", "d"]);
    const formaBefore = structuredClone(p.forma);
    const intro = p.forma.clips.find((c) => c.name === "Intro")!;
    const result = placeContentFromForma(p, "tekst");
    expect(result.ok).toBe(true);
    expect(result.project.forma).toEqual(formaBefore);
    expect(result.approximate).toBe(true);
    const starts = result.project.tekst.clips
      .map((c) => c.startTicks)
      .sort((a, b) => a - b);
    const spans = barSpansFromStarts(
      starts,
      intro.startTicks,
      intro.startTicks + 7 * BAR,
    );
    expect(spans).toEqual([1, 2, 2, 2]);
  });

  it("n > bars → D fractional", () => {
    const p = sectionProject(4, ["1", "2", "3", "4", "5", "6", "7", "8"]);
    const formaBefore = structuredClone(p.forma);
    const intro = p.forma.clips.find((c) => c.name === "Intro")!;
    const result = placeContentFromForma(p, "tekst");
    expect(result.ok).toBe(true);
    expect(result.project.forma).toEqual(formaBefore);
    const starts = result.project.tekst.clips
      .map((c) => c.startTicks)
      .sort((a, b) => a - b);
    expect(starts[0]).toBe(intro.startTicks);
    expect(starts[1]).toBe(intro.startTicks + BAR / 2);
    expect(starts).toHaveLength(8);
  });

  it("F when base≤1 and text weight disparity", () => {
    const p = sectionProject(8, [
      "Hi",
      "Yo",
      "This is a much longer phrase here",
      "Ok",
      "Go",
      "Another longer singing line now",
    ]);
    const formaBefore = structuredClone(p.forma);
    const intro = p.forma.clips.find((c) => c.name === "Intro")!;
    const result = placeContentFromForma(p, "tekst");
    expect(result.ok).toBe(true);
    expect(result.project.forma).toEqual(formaBefore);
    expect(result.approximate).toBe(true);
    const starts = result.project.tekst.clips
      .map((c) => c.startTicks)
      .sort((a, b) => a - b);
    const spans = barSpansFromStarts(
      starts,
      intro.startTicks,
      intro.startTicks + 8 * BAR,
    );
    expect(spans[2]!).toBeGreaterThan(spans[0]!);
    expect(spans[2]!).toBeGreaterThan(spans[1]!);
    expect(spans[5]!).toBeGreaterThan(spans[3]!);
    expect(spans[5]!).toBeGreaterThan(spans[4]!);
    const sum = spans.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 8)).toBeLessThan(0.05);
  });

  it("content/gap subsections → C (4+1+4+1)", () => {
    // Relative tick offsets: 4 bars, 5 bars, 9 bars into section
    const p = sectionProject(10, ["a", "b", "c", "d"], {
      subsections: [4 * BAR, 5 * BAR, 9 * BAR],
    });
    const formaBefore = structuredClone(p.forma);
    const intro = p.forma.clips.find((c) => c.name === "Intro")!;
    const result = placeContentFromForma(p, "tekst");
    expect(result.ok).toBe(true);
    expect(result.project.forma).toEqual(formaBefore);
    const starts = result.project.tekst.clips
      .map((c) => c.startTicks)
      .sort((a, b) => a - b);
    // Two lines in first content [0..4), two in second [5..9)
    expect(starts).toEqual([
      intro.startTicks,
      intro.startTicks + 2 * BAR,
      intro.startTicks + 5 * BAR,
      intro.startTicks + 7 * BAR,
    ]);
  });

  it("Forma identity unchanged across modes", () => {
    let p = createProjectSeed("p", "S", "2026-07-20T12:00:00.000Z");
    const intro0 = p.forma.clips.find((c) => c.name === "Intro")!;
    p = {
      ...p,
      forma: {
        clips: p.forma.clips.map((c) =>
          c.id === intro0.id ? { ...c, lengthTicks: 4 * BAR } : c,
        ),
      },
      tekst: {
        clips: [
          makeTekstClip("t1", 0, BAR, "One"),
          makeTekstClip("t2", 0, BAR, "Two"),
        ],
      },
      akordy: {
        clips: [
          { id: "a1", startTicks: 0, lengthTicks: BAR, symbol: "Am" },
          { id: "a2", startTicks: 0, lengthTicks: BAR, symbol: "F" },
        ],
      },
    };
    const formaBefore = structuredClone(p.forma);
    for (const mode of ["tekst", "akordy", "both"] as const) {
      const result = placeContentFromForma(p, mode);
      expect(result.ok).toBe(true);
      expect(result.project.forma).toEqual(formaBefore);
    }
  });

  it("chord path never uses F (weighted text would be F for Tekst)", () => {
    let p = sectionProject(8, [
      "Hi",
      "Yo",
      "This is a much longer phrase here",
      "Ok",
      "Go",
      "Another longer singing line now",
    ]);
    // Same count of chords; no vocals affinity → full-section A/B/D/E only
    p = {
      ...p,
      tekst: { clips: [] },
      akordy: {
        clips: ["C", "G", "Am", "F", "Dm", "E"].map((symbol, i) => ({
          id: `a${i + 1}`,
          startTicks: 0,
          lengthTicks: BAR,
          symbol,
        })),
      },
    };
    const formaBefore = structuredClone(p.forma);
    const intro = p.forma.clips.find((c) => c.name === "Intro")!;
    const result = placeContentFromForma(p, "akordy");
    expect(result.ok).toBe(true);
    expect(result.project.forma).toEqual(formaBefore);
    // 8 bars / 6 chords → B (not F): base=1, extra=2 → [1,1,1,1,2,2]
    const starts = result.project.akordy.clips
      .map((c) => c.startTicks)
      .sort((a, b) => a - b);
    const spans = barSpansFromStarts(
      starts,
      intro.startTicks,
      intro.startTicks + 8 * BAR,
    );
    expect(spans).toEqual([1, 1, 1, 1, 2, 2]);
  });

  it("leaves Countdown and digit clips alone", () => {
    let p = createProjectSeed("p", "S", "2026-07-20T12:00:00.000Z");
    const cd = p.forma.clips.find((c) => c.kind === "countdown")!;
    p = {
      ...p,
      tekst: {
        clips: [
          makeTekstClip("vl-cd-2", cd.startTicks, BAR, "2"),
          makeTekstClip("t1", 0, BAR, "Hello"),
        ],
      },
    };
    const formaBefore = structuredClone(p.forma);
    const result = placeContentFromForma(p, "tekst");
    expect(result.ok).toBe(true);
    expect(result.project.forma).toEqual(formaBefore);
    const digit = result.project.tekst.clips.find((c) => c.id === "vl-cd-2")!;
    expect(digit.startTicks).toBe(cd.startTicks);
  });

  it("scopes placement to selected Forma section ids", () => {
    let p = withVerse(createProjectSeed("p", "S", "2026-07-20T12:00:00.000Z"));
    const intro = p.forma.clips.find((c) => c.name === "Intro")!;
    const verse = p.forma.clips.find((c) => c.name === "Verse")!;
    p = {
      ...p,
      tekst: {
        clips: [
          makeTekstClip("ti", intro.startTicks, BAR, "Intro line"),
          makeTekstClip("tv", verse.startTicks + BAR, BAR, "Verse line"),
        ],
      },
    };
    const formaBefore = structuredClone(p.forma);
    const introStartBefore = p.tekst.clips.find(
      (c) => c.id === "ti",
    )!.startTicks;
    const result = placeContentFromForma(p, "tekst", {
      sectionIds: [verse.id],
    });
    expect(result.ok).toBe(true);
    expect(result.project.forma).toEqual(formaBefore);
    const introLine = result.project.tekst.clips.find((c) => c.id === "ti")!;
    const verseLine = result.project.tekst.clips.find((c) => c.id === "tv")!;
    expect(introLine.startTicks).toBe(introStartBefore);
    expect(verseLine.startTicks).toBe(verse.startTicks);
  });

  it("membership prefers sourceSection over startTicks", () => {
    let p = withVerse(createProjectSeed("p", "S", "2026-07-20T12:00:00.000Z"));
    const intro = p.forma.clips.find((c) => c.name === "Intro")!;
    const verse = p.forma.clips.find((c) => c.name === "Verse")!;
    // Lines sit in Intro abs range but declare Verse via sourceSection
    p = {
      ...p,
      tekst: {
        clips: [
          makeTekstClip("t1", intro.startTicks, BAR, "a", "Verse"),
          makeTekstClip("t2", intro.startTicks + 10, BAR, "b", "Verse"),
        ],
      },
    };
    const result = placeContentFromForma(p, "tekst", {
      sectionIds: [verse.id],
    });
    expect(result.ok).toBe(true);
    const starts = result.project.tekst.clips
      .map((c) => c.startTicks)
      .sort((a, b) => a - b);
    expect(starts).toEqual([verse.startTicks, verse.startTicks + 2 * BAR]);
  });

  it("places Akordy across Forma without mutating Forma", () => {
    let p = createProjectSeed("p", "S", "2026-07-20T12:00:00.000Z");
    const intro0 = p.forma.clips.find((c) => c.name === "Intro")!;
    p = {
      ...p,
      forma: {
        clips: p.forma.clips.map((c) =>
          c.id === intro0.id ? { ...c, lengthTicks: 4 * BAR } : c,
        ),
      },
      akordy: {
        clips: [
          { id: "a1", startTicks: 0, lengthTicks: BAR, symbol: "C" },
          { id: "a2", startTicks: 0, lengthTicks: BAR, symbol: "G" },
        ],
      },
    };
    const formaBefore = structuredClone(p.forma);
    const intro = p.forma.clips.find((c) => c.name === "Intro")!;
    const result = placeContentFromForma(p, "akordy");
    expect(result.ok).toBe(true);
    expect(result.project.forma).toEqual(formaBefore);
    const starts = result.project.akordy.clips
      .map((c) => c.startTicks)
      .sort((a, b) => a - b);
    expect(starts).toEqual([intro.startTicks, intro.startTicks + 2 * BAR]);
  });

  it("fails when Forma has no music sections", () => {
    let p = createProjectSeed("p", "S", "2026-07-20T12:00:00.000Z");
    p = {
      ...p,
      forma: {
        clips: p.forma.clips.filter((c) => c.kind === "countdown"),
      },
      tekst: {
        clips: [
          {
            id: "t1",
            startTicks: 0,
            lengthTicks: BAR,
            text: "Hi",
            blocks: [{ id: "b1", text: "Hi", startTicks: 0, lengthTicks: BAR }],
          },
        ],
      },
      akordy: {
        clips: [{ id: "a1", startTicks: 0, lengthTicks: BAR, symbol: "C" }],
      },
    };
    expect(placeContentFromForma(p, "tekst").ok).toBe(false);
    expect(placeContentFromForma(p, "tekst").message).toMatch(/Brak sekcji/);
    expect(placeContentFromForma(p, "akordy").ok).toBe(false);
    expect(placeContentFromForma(p, "akordy").message).toMatch(/Brak sekcji/);
  });

  it("fails when Tekst has no sung lines", () => {
    let p = sectionProject(4, []);
    p = {
      ...p,
      tekst: {
        clips: [
          makeTekstClip("empty", 0, BAR, "  "),
          makeTekstClip("digit-pre", -BAR, BAR, "2"),
          makeTekstClip("vl-cd-9", 0, BAR, "sung-but-cd-id"),
        ],
      },
    };
    const result = placeContentFromForma(p, "tekst");
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Brak linii Tekstu/);
  });

  it("fails when Akordy lane is empty", () => {
    const p = sectionProject(4, ["a"]);
    const result = placeContentFromForma(p, "akordy");
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Brak clipów Akordów/);
  });

  it("fails when selected sections have no matching lines", () => {
    const p = withVerse(sectionProject(4, ["only-intro"]));
    const verse = p.forma.clips.find((c) => c.name === "Verse")!;
    const result = placeContentFromForma(p, "tekst", {
      sectionIds: [verse.id],
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/zaznaczonych sekcjach/);
  });

  it("fails when selected sections have no matching chords", () => {
    let p = withVerse(sectionProject(4, []));
    const intro = p.forma.clips.find((c) => c.name === "Intro")!;
    const verse = p.forma.clips.find((c) => c.name === "Verse")!;
    p = {
      ...p,
      akordy: {
        clips: [
          {
            id: "a1",
            startTicks: intro.startTicks,
            lengthTicks: BAR,
            symbol: "C",
          },
        ],
      },
    };
    const result = placeContentFromForma(p, "akordy", {
      sectionIds: [verse.id],
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/zaznaczonych sekcjach/);
  });

  it("ignores empty sectionIds entries (whole song)", () => {
    const p = sectionProject(4, ["a", "b"]);
    const result = placeContentFromForma(p, "tekst", { sectionIds: ["", ""] });
    expect(result.ok).toBe(true);
    expect(result.placed).toBe(2);
  });

  it("F via short trailing line weight", () => {
    const p = sectionProject(8, [
      "wordy line alpha",
      "wordy line beta",
      "wordy line gamma",
      "wordy line delta",
      "wordy line epsilon",
      "x",
    ]);
    const result = placeContentFromForma(p, "tekst");
    expect(result.ok).toBe(true);
    expect(result.approximate).toBe(true);
  });

  it("single sung line uses layer E across section", () => {
    const p = sectionProject(4, ["solo"]);
    const intro = p.forma.clips.find((c) => c.name === "Intro")!;
    const result = placeContentFromForma(p, "tekst");
    expect(result.ok).toBe(true);
    expect(result.project.tekst.clips[0]!.startTicks).toBe(intro.startTicks);
  });

  it("chord D when more chords than bars", () => {
    let p = sectionProject(2, []);
    p = {
      ...p,
      akordy: {
        clips: ["C", "G", "Am", "F", "Dm"].map((symbol, i) => ({
          id: `a${i}`,
          startTicks: 0,
          lengthTicks: BAR,
          symbol,
        })),
      },
    };
    const result = placeContentFromForma(p, "akordy");
    expect(result.ok).toBe(true);
    expect(result.project.akordy.clips).toHaveLength(5);
  });

  it("chord A even split", () => {
    let p = sectionProject(4, []);
    p = {
      ...p,
      akordy: {
        clips: ["C", "G", "Am", "F"].map((symbol, i) => ({
          id: `a${i}`,
          startTicks: 0,
          lengthTicks: BAR,
          symbol,
        })),
      },
    };
    const intro = p.forma.clips.find((c) => c.name === "Intro")!;
    const result = placeContentFromForma(p, "akordy");
    expect(result.ok).toBe(true);
    const starts = result.project.akordy.clips
      .map((c) => c.startTicks)
      .sort((a, b) => a - b);
    expect(starts).toEqual([
      intro.startTicks,
      intro.startTicks + BAR,
      intro.startTicks + 2 * BAR,
      intro.startTicks + 3 * BAR,
    ]);
  });

  it("single chord uses layer E", () => {
    let p = sectionProject(4, []);
    p = {
      ...p,
      akordy: {
        clips: [{ id: "a1", startTicks: 10, lengthTicks: BAR, symbol: "C" }],
      },
    };
    const intro = p.forma.clips.find((c) => c.name === "Intro")!;
    const result = placeContentFromForma(p, "akordy");
    expect(result.ok).toBe(true);
    expect(result.project.akordy.clips[0]!.startTicks).toBe(intro.startTicks);
  });
});
