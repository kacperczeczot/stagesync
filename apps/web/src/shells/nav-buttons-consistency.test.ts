import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getCssFile(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), "utf8");
}

function extractTopLevelRuleBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, "m");
  const match = css.match(regex);
  return match?.[1] ?? "";
}

describe("Cross-shell navigation buttons CSS consistency", () => {
  const adminCss = getCssFile("admin/AdminShell.module.css");
  const clientCss = getCssFile("client/ClientShell.module.css");
  const appHeaderCss = getCssFile("components/AppHeader.module.css");
  const operatorNavCss = getCssFile("components/OperatorNav.module.css");

  const requiredTokens = [
    "display: inline-flex",
    "align-items: center",
    "justify-content: center",
    "box-sizing: border-box",
    "min-height: var(--ss-touch-min)",
    "line-height: var(--ss-leading-compact)",
    "border: 1px solid transparent",
    "border-radius: var(--ss-radius-sm)",
    "white-space: nowrap",
  ];

  it("ensures OperatorNav .segmentLink, .segmentMuted, .segmentChip declare canonical button tokens", () => {
    const block = extractTopLevelRuleBlock(
      operatorNavCss,
      ".segmentLink,\n.segmentMuted,\n.segmentChip",
    );
    expect(block).toBeTruthy();
    for (const token of requiredTokens) {
      expect(block).toContain(token);
    }
  });

  it("ensures ClientShell .appJump a and .appJumpMuted declare canonical button tokens", () => {
    const linkBlock = extractTopLevelRuleBlock(clientCss, ".appJump a");
    expect(linkBlock).toBeTruthy();
    for (const token of requiredTokens) {
      expect(linkBlock).toContain(token);
    }

    const mutedBlock = extractTopLevelRuleBlock(clientCss, ".appJumpMuted");
    expect(mutedBlock).toBeTruthy();
    for (const token of requiredTokens) {
      expect(mutedBlock).toContain(token);
    }
  });

  it("ensures AdminShell .appJump a and .appJumpMuted declare canonical button tokens", () => {
    const linkBlock = extractTopLevelRuleBlock(adminCss, ".appJump a");
    expect(linkBlock).toBeTruthy();
    for (const token of requiredTokens) {
      expect(linkBlock).toContain(token);
    }

    const mutedBlock = extractTopLevelRuleBlock(adminCss, ".appJumpMuted");
    expect(mutedBlock).toBeTruthy();
    for (const token of requiredTokens) {
      expect(mutedBlock).toContain(token);
    }
  });

  it("ensures AppHeader .appJump a and .appJumpMuted declare canonical button tokens", () => {
    const linkBlock = extractTopLevelRuleBlock(appHeaderCss, ".appJump a");
    expect(linkBlock).toBeTruthy();
    for (const token of requiredTokens) {
      expect(linkBlock).toContain(token);
    }

    const mutedBlock = extractTopLevelRuleBlock(appHeaderCss, ".appJumpMuted");
    expect(mutedBlock).toBeTruthy();
    for (const token of requiredTokens) {
      expect(mutedBlock).toContain(token);
    }
  });

  it("ensures tablet responsive density uses padding-inline without compromising height", () => {
    const clientTablet = clientCss.match(
      /@media\s*\(min-width:\s*641px\)\s*and\s*\(max-width:\s*1024px\)\s*\{([\s\S]*?)\n\}/,
    )?.[1] ?? "";
    expect(clientTablet).toContain("padding-inline: var(--ss-space-2)");
    expect(clientTablet).not.toContain("padding: var(--ss-space-1)");

    const adminTablet = adminCss.match(
      /@media\s*\(min-width:\s*641px\)\s*and\s*\(max-width:\s*1024px\)\s*\{([\s\S]*?)\n\}/,
    )?.[1] ?? "";
    expect(adminTablet).toContain("padding-inline: var(--ss-space-2)");

    const headerTablet = appHeaderCss.match(
      /@media\s*\(min-width:\s*641px\)\s*and\s*\(max-width:\s*1024px\)\s*\{([\s\S]*?)\n\}/,
    )?.[1] ?? "";
    expect(headerTablet).toContain("padding-inline: var(--ss-space-2)");
  });

  it("ensures compact mobile navigation links enforce touch-min-shell-action across shells", () => {
    expect(operatorNavCss).toContain("min-height: var(--ss-touch-min-shell-action)");
    expect(clientCss).toContain("min-height: var(--ss-touch-min-shell-action)");
    expect(adminCss).toContain("min-height: var(--ss-touch-min-shell-action)");
    expect(appHeaderCss).toContain("min-height: var(--ss-touch-min-shell-action)");
  });
});
