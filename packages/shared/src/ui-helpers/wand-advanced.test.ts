import { describe, expect, it } from "vitest";
import { placeContentFromForma, wandContentToForma } from "./wand.js";
import {
  BAR,
  barSpansFromStarts,
  makeTekstClip,
  sectionProject,
  withVerse,
} from "./wand.test-helpers.js";
import { createProjectSeed } from "../project/project-seed.js";

describe("placeContentFromForma advanced", () => {
  it("membership falls through to last section past end", () => {
    let p = withVerse(sectionProject(2, []));
    const verse = p.forma.clips.find((c) => c.name === "Verse")!;
    p = {
      ...p,
      tekst: {
        clips: [
          makeTekstClip(
            "t-past",
            verse.startTicks + verse.lengthTicks + BAR,
            BAR,
            "after",
          ),
        ],
      },
    };
    const result = placeContentFromForma(p, "tekst");
    expect(result.ok).toBe(true);
    expect(result.project.tekst.clips[0]!.startTicks).toBe(verse.startTicks);
  });

  it("near next-section boundary prefers the next section", () => {
    let p = withVerse(sectionProject(4, []));
    const intro = p.forma.clips.find((c) => c.name === "Intro")!;
    const verse = p.forma.clips.find((c) => c.name === "Verse")!;
    // Last bar of Intro → treated as belonging to Verse
    p = {
      ...p,
      tekst: {
        clips: [
          makeTekstClip("t-boundary", verse.startTicks - BAR / 2, BAR, "edge"),
        ],
      },
    };
    const result = placeContentFromForma(p, "tekst", {
      sectionIds: [verse.id],
    });
    expect(result.ok).toBe(true);
    expect(result.project.tekst.clips[0]!.startTicks).toBe(verse.startTicks);
    void intro;
  });

  it("content/gap with consecutive gaps still places when ≥2 content spans", () => {
    // gap,gap,content,content — alternating=false but content.length≥2
    const p = sectionProject(12, ["a", "b", "c", "d"], {
      subsections: [1 * BAR, 2 * BAR, 6 * BAR],
    });
    const result = placeContentFromForma(p, "tekst");
    expect(result.ok).toBe(true);
    expect(result.placed).toBe(4);
  });

  it("content/gap redistributes zero counts across uneven spans", () => {
    // Wide + narrow content: 2 lines → one span would floor to 0 without donor
    const p = sectionProject(12, ["a", "b"], {
      subsections: [9 * BAR, 10 * BAR],
    });
    const result = placeContentFromForma(p, "tekst");
    expect(result.ok).toBe(true);
    expect(result.placed).toBe(2);
    const starts = result.project.tekst.clips
      .map((c) => c.startTicks)
      .sort((a, b) => a - b);
    expect(starts[0]).not.toBe(starts[1]);
  });

  it("content/gap single-line chunk uses layer E", () => {
    const p = sectionProject(10, ["a", "b"], {
      subsections: [4 * BAR, 5 * BAR, 9 * BAR],
    });
    const result = placeContentFromForma(p, "tekst");
    expect(result.ok).toBe(true);
    expect(result.placed).toBe(2);
  });

  it("empty sections still walk placeSectionContent (no-op)", () => {
    const p = withVerse(sectionProject(4, ["intro-only"]));
    const result = placeContentFromForma(p, "tekst");
    expect(result.ok).toBe(true);
    expect(result.placed).toBe(1);
  });

  it("akordy membership via sourceLineId → vocal sourceSection", () => {
    let p = withVerse(sectionProject(4, []));
    const intro = p.forma.clips.find((c) => c.name === "Intro")!;
    const verse = p.forma.clips.find((c) => c.name === "Verse")!;
    p = {
      ...p,
      tekst: {
        clips: [
          makeTekstClip(
            "line-v",
            intro.startTicks,
            BAR,
            "verse lyric",
            "Verse",
          ),
        ],
      },
      akordy: {
        clips: [
          {
            id: "a1",
            startTicks: intro.startTicks,
            lengthTicks: BAR,
            symbol: "Am",
            sourceLineId: "line-v",
          },
          {
            id: "a2",
            startTicks: intro.startTicks + 10,
            lengthTicks: BAR,
            symbol: "F",
            sourceLineId: "line-v",
          },
        ],
      },
    };
    const result = placeContentFromForma(p, "akordy", {
      sectionIds: [verse.id],
    });
    expect(result.ok).toBe(true);
    expect(result.placed).toBe(2);
    expect(
      result.project.akordy.clips.every(
        (c) => c.startTicks >= verse.startTicks,
      ),
    ).toBe(true);
  });

  it("akordy membership via sourceLineId without sourceSection uses line ticks", () => {
    let p = withVerse(sectionProject(4, []));
    const verse = p.forma.clips.find((c) => c.name === "Verse")!;
    p = {
      ...p,
      tekst: {
        clips: [
          makeTekstClip("line-v", verse.startTicks + BAR, BAR, "verse lyric"),
        ],
      },
      akordy: {
        clips: [
          {
            id: "a1",
            startTicks: 0,
            lengthTicks: BAR,
            symbol: "C",
            sourceLineId: "line-v",
          },
        ],
      },
    };
    const result = placeContentFromForma(p, "akordy", {
      sectionIds: [verse.id],
    });
    expect(result.ok).toBe(true);
    expect(result.project.akordy.clips[0]!.startTicks).toBe(
      verse.startTicks + BAR,
    );
  });

  it("akordy places along vocal spans when sourceLineId tags match", () => {
    let p = sectionProject(8, []);
    const intro = p.forma.clips.find((c) => c.name === "Intro")!;
    p = {
      ...p,
      tekst: {
        clips: [
          makeTekstClip("l1", intro.startTicks, 4 * BAR, "first", "Intro"),
          makeTekstClip(
            "l2",
            intro.startTicks + 4 * BAR,
            4 * BAR,
            "second",
            "Intro",
          ),
        ],
      },
      akordy: {
        clips: [
          {
            id: "a1",
            startTicks: 0,
            lengthTicks: BAR,
            symbol: "C",
            sourceLineId: "l1",
          },
          {
            id: "a2",
            startTicks: 0,
            lengthTicks: BAR,
            symbol: "G",
            sourceLineId: "l1",
          },
          {
            id: "a3",
            startTicks: 0,
            lengthTicks: BAR,
            symbol: "Am",
            sourceLineId: "l2",
          },
        ],
      },
    };
    const result = placeContentFromForma(p, "akordy");
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/po wersach/);
    const byId = Object.fromEntries(
      result.project.akordy.clips.map((c) => [c.id, c.startTicks]),
    );
    expect(byId.a1).toBe(intro.startTicks);
    expect(byId.a3).toBeGreaterThanOrEqual(intro.startTicks + 4 * BAR);
  });

  it("akordy packs by bar clusters when count matches vocal spans", () => {
    let p = sectionProject(8, []);
    const intro = p.forma.clips.find((c) => c.name === "Intro")!;
    p = {
      ...p,
      tekst: {
        clips: [
          makeTekstClip("l1", intro.startTicks, BAR, "one"),
          makeTekstClip("l2", intro.startTicks + 4 * BAR, BAR, "two"),
        ],
      },
      akordy: {
        clips: [
          {
            id: "a1",
            startTicks: intro.startTicks,
            lengthTicks: BAR,
            symbol: "C",
          },
          {
            id: "a2",
            startTicks: intro.startTicks + 4 * BAR,
            lengthTicks: BAR,
            symbol: "G",
          },
        ],
      },
    };
    const result = placeContentFromForma(p, "akordy");
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/po wersach/);
  });

  it("akordy content/gap approximate B under layer C", () => {
    // 5-bar + 4-bar content pockets; 2 chords in 5 bars → layer B
    let p = sectionProject(10, [], {
      subsections: [5 * BAR, 6 * BAR],
    });
    p = {
      ...p,
      akordy: {
        clips: ["C", "G", "Am"].map((symbol, i) => ({
          id: `a${i}`,
          startTicks: 0,
          lengthTicks: BAR,
          symbol,
        })),
      },
    };
    const result = placeContentFromForma(p, "akordy");
    expect(result.ok).toBe(true);
    expect(result.approximate).toBe(true);
  });

  it("both mode keeps Tekst when Akordy fails", () => {
    const p = sectionProject(4, ["a", "b"]);
    const result = placeContentFromForma(p, "both");
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Tekst OK/);
    expect(result.project.tekst.clips[0]!.startTicks).toBeDefined();
    expect(result.project.akordy.clips).toHaveLength(0);
  });

  it("both mode places Tekst and Akordy together", () => {
    let p = sectionProject(4, ["a", "b"]);
    p = {
      ...p,
      akordy: {
        clips: [
          { id: "a1", startTicks: 0, lengthTicks: BAR, symbol: "C" },
          { id: "a2", startTicks: 0, lengthTicks: BAR, symbol: "G" },
        ],
      },
    };
    const result = placeContentFromForma(p, "both");
    expect(result.ok).toBe(true);
    expect(result.placed).toBe(4);
    expect(result.message).toMatch(/Tekst \+ Akordy/);
  });

  it("wandContentToForma returns placed project only", () => {
    const p = sectionProject(4, ["a", "b"]);
    const project = wandContentToForma(p, "tekst");
    expect(project.tekst.clips).toHaveLength(2);
    expect(project.forma).toEqual(p.forma);
  });

  it("clamps crowded onsets inside a short content span", () => {
    // Many lines forced into a 2-bar content pocket → onset clamp paths
    const p = sectionProject(8, ["1", "2", "3", "4", "5", "6", "7", "8"], {
      subsections: [2 * BAR, 3 * BAR, 5 * BAR],
    });
    const result = placeContentFromForma(p, "tekst");
    expect(result.ok).toBe(true);
    expect(result.placed).toBe(8);
    const intro = p.forma.clips.find((c) => c.name === "Intro")!;
    const starts = result.project.tekst.clips.map((c) => c.startTicks);
    expect(Math.max(...starts)).toBeLessThan(
      intro.startTicks + intro.lengthTicks,
    );
  });

  it("skips countdown digit akordy ids in membership", () => {
    let p = sectionProject(4, []);
    p = {
      ...p,
      akordy: {
        clips: [
          {
            id: "vl-cd-chord",
            startTicks: 0,
            lengthTicks: BAR,
            symbol: "2",
          },
          { id: "a1", startTicks: 0, lengthTicks: BAR, symbol: "C" },
        ],
      },
    };
    const result = placeContentFromForma(p, "akordy");
    expect(result.ok).toBe(true);
    expect(result.placed).toBe(1);
  });

  it("unknown sourceSection falls back to startTicks membership", () => {
    let p = sectionProject(4, []);
    const intro = p.forma.clips.find((c) => c.name === "Intro")!;
    p = {
      ...p,
      tekst: {
        clips: [
          makeTekstClip("t1", intro.startTicks, BAR, "hi", "DoesNotExist"),
        ],
      },
    };
    const result = placeContentFromForma(p, "tekst");
    expect(result.ok).toBe(true);
    expect(result.project.tekst.clips[0]!.startTicks).toBe(intro.startTicks);
  });

  it("clamps onsets that snap past spanEnd − beat", () => {
    // 1-bar section / 8 lines → fractional D; last onsets exceed maxStart
    const p = sectionProject(1, ["1", "2", "3", "4", "5", "6", "7", "8"]);
    const result = placeContentFromForma(p, "tekst");
    expect(result.ok).toBe(true);
    expect(result.placed).toBe(8);
    const intro = p.forma.clips.find((c) => c.name === "Intro")!;
    const maxStart = intro.startTicks + intro.lengthTicks - BAR / 4;
    for (const c of result.project.tekst.clips) {
      expect(c.startTicks).toBeLessThanOrEqual(maxStart);
    }
  });

  it("fails when sung lines sit before the first Forma section", () => {
    let p = sectionProject(4, []);
    p = {
      ...p,
      tekst: {
        clips: [makeTekstClip("t-early", -2 * BAR, BAR, "pre-roll lyric")],
      },
    };
    const result = placeContentFromForma(p, "tekst");
    expect(result.ok).toBe(false);
    expect(result.message).toBe("Brak linii do rozmieszczenia");
  });

  it("fails when chords sit before the first Forma section", () => {
    let p = sectionProject(4, []);
    p = {
      ...p,
      akordy: {
        clips: [
          {
            id: "a-early",
            startTicks: -2 * BAR,
            lengthTicks: BAR,
            symbol: "C",
          },
        ],
      },
    };
    const result = placeContentFromForma(p, "akordy");
    expect(result.ok).toBe(false);
    expect(result.message).toBe("Brak clipów do rozmieszczenia");
  });

  it("Layer F weights uneven lyric lines (approximate placement)", () => {
    const p = sectionProject(5, [
      "Hi",
      "Hello world",
      "A",
      "Super long lyric line here",
    ]);
    const result = placeContentFromForma(p, "tekst");
    expect(result.ok).toBe(true);
    expect(result.approximate).toBe(true);
    const intro = p.forma.clips.find((c) => c.name === "Intro")!;
    const spans = barSpansFromStarts(
      result.project.tekst.clips.map((c) => c.startTicks).sort((a, b) => a - b),
      intro.startTicks,
      intro.startTicks + intro.lengthTicks,
    );
    expect(spans.some((s) => s < 1)).toBe(true);
    expect(spans.some((s) => s > 1.5)).toBe(true);
  });

  it("fail-soft ok:false matrix without throwing", () => {
    const emptyForma = createProjectSeed("p", "S", "2026-07-20T12:00:00.000Z");
    const noSections = {
      ...emptyForma,
      forma: { clips: [] },
    };
    expect(placeContentFromForma(noSections, "tekst")).toMatchObject({
      ok: false,
      message: "Brak sekcji Formy",
    });

    const noLyrics = sectionProject(4, []);
    expect(placeContentFromForma(noLyrics, "tekst")).toMatchObject({
      ok: false,
      message: "Brak linii Tekstu",
    });

    const scoped = sectionProject(4, ["a", "b"]);
    expect(
      placeContentFromForma(scoped, "tekst", {
        sectionIds: ["missing-section"],
      }),
    ).toMatchObject({
      ok: false,
      message: "Brak linii Tekstu w zaznaczonych sekcjach",
    });

    const bothEmpty = {
      ...sectionProject(4, []),
      akordy: { clips: [] },
    };
    expect(placeContentFromForma(bothEmpty, "both")).toMatchObject({
      ok: false,
    });
  });
});
