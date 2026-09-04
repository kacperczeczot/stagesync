import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  bridgeUsUgFromTexts,
  parseChordProLyricLine,
} from "./text-anchor-bridge.js";

const FIX = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "us-ug",
);

function loadPair(name: string): { us: string; ug: string } {
  return {
    us: readFileSync(join(FIX, name, "song.txt"), "utf8"),
    ug: readFileSync(join(FIX, name, "chords.txt"), "utf8"),
  };
}

describe("text-anchor-bridge — chord placement and harmony", () => {
  it("S1: three chords from syllables / structural — ordered, no half-bar crush", () => {
    const us = `#TITLE:X
#ARTIST:Y
#BPM:480
#GAP:0
: 0 4 0 Hel
: 4 4 0 lo 
-- 10
: 20 4 0 world 
-- 30
E
`;
    const ug = `[Verse]
[C]Hello [G]missing [Am]world
`;
    const bridged = bridgeUsUgFromTexts(us, ug, { idPrefix: "s1" });
    expect(bridged.ok).toBe(true);
    if (!bridged.ok) return;
    expect(bridged.akordy.clips.length).toBeGreaterThanOrEqual(1);
    expect(bridged.akordy.clips[0]!.symbol).toBe("C");
    const onsets = bridged.akordy.clips.map((c) => c.startTicks);
    // Ordered when multiple chords fit the Forma wall
    for (let i = 1; i < onsets.length; i++) {
      expect(onsets[i]!).toBeGreaterThanOrEqual(onsets[i - 1]!);
    }
  });

  it("S2: Solo without US syllables uses even grid (no accent crash)", () => {
    const { us, ug } = loadPair("with-solo");
    const bridged = bridgeUsUgFromTexts(us, ug, { idPrefix: "s2" });
    expect(bridged.ok).toBe(true);
    if (!bridged.ok) return;
    const solo = bridged.sections.find((s) => s.name === "Solo")!;
    expect(solo.anchored).toBe(false);
    expect(solo.chordCount).toBeGreaterThanOrEqual(1);
    const soloClips = bridged.akordy.clips.filter(
      (c) =>
        c.startTicks >= solo.startTicks &&
        c.startTicks < solo.startTicks + solo.lengthTicks,
    );
    expect(soloClips.length).toBe(solo.chordCount);
  });

  it("S3: dual [G][D]word → first from syllable, second structural bar (no half-bar crush)", () => {
    const us = `#TITLE:X
#ARTIST:Y
#BPM:480
#GAP:0
: 0 8 0 word 
-- 16
E
`;
    const ug = `[Verse]
[G][D]word
`;
    const r = parseChordProLyricLine("[G][D]word");
    expect(r.chords).toEqual([
      { symbol: "G", wordIndex: 0 },
      { symbol: "D", wordIndex: 0 },
    ]);

    const bridged = bridgeUsUgFromTexts(us, ug, { idPrefix: "s3" });
    expect(bridged.ok).toBe(true);
    if (!bridged.ok) return;
    expect(bridged.akordy.clips.map((c) => c.symbol)).toEqual(["G", "D"]);
    const [g, d] = bridged.akordy.clips;
    const BAR = 3840;
    expect(d!.startTicks).toBeGreaterThan(g!.startTicks);
    // No half-bar densify: when Forma has ≥2 bars, structural offset is 1 bar
    const formaBars = bridged.formaMusic.clips[0]!.lengthTicks / BAR;
    if (formaBars >= 2) {
      expect(d!.startTicks - g!.startTicks).toBeGreaterThanOrEqual(BAR);
    }
  });

  it("dual-layer: never copies Intro pipe harmony into a differently chorded Chorus", () => {
    const us = `#TITLE:X
#ARTIST:Y
#BPM:480
#GAP:8000
: 0 4 0 Hel
: 4 4 0 lo 
-- 10
: 64 4 0 Cho
: 68 4 0 rus 
-- 80
E
`;
    const ug = `[Intro]
| C | % | G | % |

[Verse]
[C]Hello

[Chorus]
[Am]Chorus
[F]Line
`;
    const bridged = bridgeUsUgFromTexts(us, ug, { idPrefix: "nox" });
    expect(bridged.ok).toBe(true);
    if (!bridged.ok) return;
    const chorus = bridged.formaMusic.clips.find((c) => c.name === "Chorus")!;
    const intro = bridged.formaMusic.clips.find((c) => c.name === "Intro")!;
    const introSyms = bridged.akordy.clips
      .filter((c) => c.startTicks < intro.startTicks + intro.lengthTicks)
      .map((c) => c.symbol);
    const chorusSyms = bridged.akordy.clips
      .filter((c) => c.startTicks >= chorus.startTicks)
      .map((c) => c.symbol);
    expect(introSyms).toEqual(["C", "G"]);
    expect(chorusSyms).toEqual(["Am", "F"]);
    expect(chorusSyms.some((s) => introSyms.includes(s))).toBe(false);
  });
});
