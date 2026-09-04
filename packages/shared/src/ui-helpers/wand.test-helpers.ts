import { DEFAULT_PPQ, ticksPerBar } from "../time-tempo/time.js";
import { createProjectSeed } from "../project/project-seed.js";
import type { Project } from "../project/schema.js";

export const BAR = ticksPerBar({ numerator: 4, denominator: 4 }, DEFAULT_PPQ); // 3840

export function makeTekstClip(
  id: string,
  startTicks: number,
  lengthTicks: number,
  text: string,
  sourceSection?: string,
) {
  return {
    id,
    startTicks,
    lengthTicks,
    text,
    ...(sourceSection ? { sourceSection } : {}),
    blocks: [{ id: `${id}_b`, text, startTicks, lengthTicks }],
  };
}

export function barSpansFromStarts(
  starts: number[],
  secStart: number,
  secEnd: number,
): number[] {
  const abs = [...starts, secEnd];
  return abs.slice(0, -1).map((s, i) => (abs[i + 1]! - s) / BAR);
}

export function sectionProject(
  bars: number,
  lines: string[],
  opts?: { subsections?: number[] },
): Project {
  let p = createProjectSeed("p", "S", "2026-07-20T12:00:00.000Z");
  const intro = p.forma.clips.find((c) => c.name === "Intro")!;
  const subsections = opts?.subsections;
  p = {
    ...p,
    forma: {
      clips: p.forma.clips.map((c) =>
        c.id === intro.id
          ? {
              ...c,
              lengthTicks: bars * BAR,
              ...(subsections ? { subsections } : {}),
            }
          : c,
      ),
    },
    tekst: {
      clips: lines.map((text, i) => ({
        id: `t${i + 1}`,
        startTicks: intro.startTicks,
        lengthTicks: BAR,
        text,
        blocks: [
          {
            id: `b${i + 1}`,
            text,
            startTicks: intro.startTicks,
            lengthTicks: BAR,
          },
        ],
      })),
    },
  };
  return p;
}

export function withVerse(p: Project): Project {
  const intro = p.forma.clips.find((c) => c.name === "Intro")!;
  return {
    ...p,
    forma: {
      clips: [
        ...p.forma.clips.filter((c) => c.id !== intro.id),
        { ...intro, lengthTicks: 2 * BAR },
        {
          id: "forma-verse",
          name: "Verse",
          kind: "section" as const,
          startTicks: intro.startTicks + 2 * BAR,
          lengthTicks: 4 * BAR,
        },
      ],
    },
  };
}
