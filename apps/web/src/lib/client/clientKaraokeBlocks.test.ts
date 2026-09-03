import { describe, expect, it } from "vitest";
import {
  createProjectV6Seed,
  DEFAULT_PPQ,
  withWholeLineTekstBlocks,
  type Project,
  type TekstClip,
} from "@stagesync/shared";
import {
  buildKaraokeLiveContext,
  collectTekstBlockRoles,
  filterTekstBlocksByRole,
  mapKaraokeBlocks,
  resolveActiveBlockId,
} from "./clientKaraoke.js";

const BEAT = DEFAULT_PPQ; // 960

function lineClip(
  partial: Omit<TekstClip, "blocks"> & { blocks?: TekstClip["blocks"] },
): TekstClip {
  if (partial.blocks != null && partial.blocks.length > 0) {
    return partial as TekstClip;
  }
  return withWholeLineTekstBlocks(partial);
}

describe("clientKaraoke blocks and roles", () => {
  const project = createProjectV6Seed(
    "id",
    "Demo Song",
    "2026-07-20T00:00:00.000Z",
  );

  describe("block highlight (half-open)", () => {
    const multiBlock = lineClip({
      id: "tx-multi",
      text: "Hello world",
      startTicks: 0,
      lengthTicks: 4 * BEAT,
      blocks: [
        {
          id: "b-hello",
          text: "Hello ",
          startTicks: 0,
          lengthTicks: BEAT,
        },
        {
          id: "b-world",
          text: "world",
          startTicks: 2 * BEAT,
          lengthTicks: BEAT,
        },
      ],
    });

    const withMulti: Project = {
      ...project,
      tekst: { clips: [multiBlock] },
    };

    it("resolveActiveBlockId holds until next syllable (fills gaps)", () => {
      expect(resolveActiveBlockId(multiBlock.blocks, 0, 4 * BEAT)).toBe(
        "b-hello",
      );
      expect(resolveActiveBlockId(multiBlock.blocks, BEAT - 1, 4 * BEAT)).toBe(
        "b-hello",
      );
      // Former gap: still hello until world starts
      expect(resolveActiveBlockId(multiBlock.blocks, BEAT, 4 * BEAT)).toBe(
        "b-hello",
      );
      expect(
        resolveActiveBlockId(multiBlock.blocks, 2 * BEAT - 1, 4 * BEAT),
      ).toBe("b-hello");
      expect(resolveActiveBlockId(multiBlock.blocks, 2 * BEAT, 4 * BEAT)).toBe(
        "b-world",
      );
      expect(resolveActiveBlockId(multiBlock.blocks, 3 * BEAT, 4 * BEAT)).toBe(
        "b-world",
      );
      expect(resolveActiveBlockId(undefined, 0)).toBeNull();
    });

    it("highlights active block through gaps until next onset", () => {
      const onHello = buildKaraokeLiveContext(withMulti, BEAT / 2)!;
      expect(onHello.lines[0]?.active).toBe(true);
      expect(onHello.activeBlockId).toBe("b-hello");
      expect(
        onHello.lines[0]?.blocks?.map((b) => [b.id, b.active, b.past]),
      ).toEqual([
        ["b-hello", true, false],
        ["b-world", false, false],
      ]);

      const inGap = buildKaraokeLiveContext(withMulti, BEAT + 10)!;
      expect(inGap.lines[0]?.active).toBe(true);
      expect(inGap.activeBlockId).toBe("b-hello");
      expect(
        inGap.lines[0]?.blocks?.find((b) => b.id === "b-hello")?.active,
      ).toBe(true);
      expect(
        inGap.lines[0]?.blocks?.find((b) => b.id === "b-hello")?.past,
      ).toBe(false);

      const onWorld = buildKaraokeLiveContext(withMulti, 2 * BEAT + 10)!;
      expect(onWorld.activeBlockId).toBe("b-world");
      expect(
        onWorld.lines[0]?.blocks?.find((b) => b.id === "b-world")?.active,
      ).toBe(true);
      expect(
        onWorld.lines[0]?.blocks?.find((b) => b.id === "b-hello")?.past,
      ).toBe(true);
    });

    it("1-tick syllables stay yellow until the next block", () => {
      const flashy: Project = {
        ...project,
        tekst: {
          clips: [
            {
              id: "tx-flash",
              text: "A B C",
              startTicks: 0,
              lengthTicks: 3 * BEAT,
              blocks: [
                { id: "a", text: "A ", startTicks: 0, lengthTicks: 1 },
                { id: "b", text: "B ", startTicks: BEAT, lengthTicks: 1 },
                { id: "c", text: "C", startTicks: 2 * BEAT, lengthTicks: 1 },
              ],
            },
          ],
        },
      };
      const midA = buildKaraokeLiveContext(flashy, BEAT / 2)!;
      expect(midA.activeBlockId).toBe("a");
      expect(midA.lines[0]?.blocks?.find((b) => b.id === "a")?.active).toBe(
        true,
      );
      const midB = buildKaraokeLiveContext(flashy, BEAT + 10)!;
      expect(midB.activeBlockId).toBe("b");
    });

    it("single whole-line block mirrors line active window (migrate 1:1)", () => {
      const one: Project = {
        ...project,
        tekst: {
          clips: [
            lineClip({
              id: "tx-one",
              text: "Whole",
              startTicks: 0,
              lengthTicks: 2 * BEAT,
            }),
          ],
        },
      };
      const ctx = buildKaraokeLiveContext(one, BEAT)!;
      expect(ctx.lines[0]?.blocks).toHaveLength(1);
      expect(ctx.lines[0]?.active).toBe(true);
      expect(ctx.lines[0]?.blocks?.[0]?.active).toBe(true);
      expect(ctx.lines[0]?.blocks?.[0]?.text).toBe("Whole");
      expect(ctx.activeBlockId).toBe(ctx.lines[0]?.blocks?.[0]?.id);

      const past = buildKaraokeLiveContext(one, 2 * BEAT)!;
      expect(past.lines[0]?.active).toBe(false);
      expect(past.lines[0]?.blocks?.[0]?.active).toBe(false);
      expect(past.lines[0]?.blocks?.[0]?.past).toBe(true);
      expect(past.activeBlockId).toBeNull();
    });

    it("mapKaraokeBlocks returns undefined without blocks", () => {
      expect(
        mapKaraokeBlocks(
          {
            startTicks: 0,
            lengthTicks: 3840,
            text: "",
            blocks: undefined as unknown as TekstClip["blocks"],
          },
          0,
          true,
        ),
      ).toBeUndefined();
      expect(
        mapKaraokeBlocks(
          { startTicks: 0, lengthTicks: 3840, text: "", blocks: [] },
          0,
          true,
        ),
      ).toBeUndefined();
    });

    it("mapKaraokeBlocks restores word spaces from line text when blocks are trimmed", () => {
      const tokens = mapKaraokeBlocks(
        {
          startTicks: 0,
          lengthTicks: 3840,
          text: "I hear the drums",
          blocks: [
            { id: "b1", text: "I", startTicks: 0, lengthTicks: BEAT },
            { id: "b2", text: "hear", startTicks: BEAT, lengthTicks: BEAT },
            { id: "b3", text: "the", startTicks: 2 * BEAT, lengthTicks: BEAT },
            {
              id: "b4",
              text: "drums",
              startTicks: 3 * BEAT,
              lengthTicks: BEAT,
            },
          ],
        },
        0,
        true,
      );
      expect(tokens?.map((b) => b.text)).toEqual([
        "I ",
        "hear ",
        "the ",
        "drums",
      ]);
      expect(tokens?.map((b) => b.text).join("")).toBe("I hear the drums");
    });
  });

  describe("role filter", () => {
    const dualRole = lineClip({
      id: "tx-roles",
      text: "You me",
      startTicks: 0,
      lengthTicks: 4 * BEAT,
      blocks: [
        {
          id: "b-v1",
          text: "You ",
          startTicks: 0,
          lengthTicks: 2 * BEAT,
          role: "vocal_1",
        },
        {
          id: "b-v2",
          text: "me",
          startTicks: 2 * BEAT,
          lengthTicks: 2 * BEAT,
          role: "vocal_2",
        },
      ],
    });

    const withRoles: Project = {
      ...project,
      tekst: { clips: [dualRole] },
    };

    it("collectTekstBlockRoles lists distinct roles", () => {
      expect(collectTekstBlockRoles([dualRole])).toEqual([
        "vocal_1",
        "vocal_2",
      ]);
    });

    it("filterTekstBlocksByRole keeps untagged and all", () => {
      const mixed = [
        ...dualRole.blocks,
        {
          id: "b-all",
          text: "!",
          startTicks: 0,
          lengthTicks: BEAT,
          role: "all" as const,
        },
        {
          id: "b-free",
          text: "?",
          startTicks: 0,
          lengthTicks: BEAT,
        },
      ];
      expect(
        filterTekstBlocksByRole(mixed, "vocal_1").map((b) => b.id),
      ).toEqual(["b-v1", "b-all", "b-free"]);
    });

    it("buildKaraokeLiveContext filters blocks when ≥2 roles", () => {
      const all = buildKaraokeLiveContext(withRoles, BEAT)!;
      expect(all.availableRoles).toEqual(["vocal_1", "vocal_2"]);
      expect(all.lines[0]?.blocks).toHaveLength(2);

      const onlyV1 = buildKaraokeLiveContext(withRoles, BEAT, {
        roleFilter: "vocal_1",
      })!;
      expect(onlyV1.lines[0]?.blocks?.map((b) => b.id)).toEqual(["b-v1"]);
      expect(onlyV1.activeBlockId).toBe("b-v1");

      const onlyV2 = buildKaraokeLiveContext(withRoles, 3 * BEAT, {
        roleFilter: "vocal_2",
      })!;
      expect(onlyV2.lines[0]?.blocks?.map((b) => b.id)).toEqual(["b-v2"]);
      expect(onlyV2.activeBlockId).toBe("b-v2");
    });

    it("ignores roleFilter when fewer than 2 roles present", () => {
      const single: Project = {
        ...project,
        tekst: {
          clips: [
            lineClip({
              id: "tx-one-role",
              text: "Solo",
              startTicks: 0,
              lengthTicks: BEAT,
              blocks: [
                {
                  id: "b-solo",
                  text: "Solo",
                  startTicks: 0,
                  lengthTicks: BEAT,
                  role: "vocal_1",
                },
              ],
            }),
          ],
        },
      };
      const ctx = buildKaraokeLiveContext(single, 0, {
        roleFilter: "vocal_2",
      })!;
      expect(ctx.availableRoles).toEqual(["vocal_1"]);
      expect(ctx.lines[0]?.blocks).toHaveLength(1);
      expect(ctx.lines[0]?.blocks?.[0]?.id).toBe("b-solo");
    });
  });
});
