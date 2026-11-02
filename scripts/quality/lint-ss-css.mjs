#!/usr/bin/env node
/**
 * Gate: no ad-hoc HEX and no fractional rem in shell / launcher CSS.
 * Soft-px (1px / 2px) OK. DAW Timeline geometry excluded from frac-rem.
 * Exception lines: mark with the token ss-css-allow inside a CSS comment.
 *
 * Additional UI Architecture Gates:
 * 1. Dialogs in apps/web/src/shells/timeline/dialogs/ cannot have their own *.css / *.module.css files.
 *    They MUST reuse TimelineShell.module.css or @stagesync/ui components.
 * 2. Dialogs in apps/web/src/shells/timeline/dialogs/ cannot use inline styles (style={{...).
 *    All styling must be in TimelineShell.module.css or @stagesync/ui (per .agents/rules/project.md).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "../..");

const SCAN_ROOTS = [
  join(root, "apps/web/src"),
  join(root, "apps/desktop/launcher"),
];

/** Frac-rem allowed — domain DAW canvas / dock geometry (plan Phase 5 exception). */
const FRAC_REM_ALLOW_FILES = new Set([
  "apps/web/src/shells/TimelineShell.module.css",
  "apps/web/src/shells/timeline/channelStrip/ChannelStripControls.module.css",
]);

const FRAC_REM_RE = /\d+\.\d+rem\b/;
const ALLOW_MARK = "ss-css-allow";

function isSkipped(filePath) {
  const rel = relative(root, filePath).replaceAll("\\", "/");
  return rel.includes("/launcher/vendor/");
}

export function hasColorHex(code) {
  for (const m of code.matchAll(/#([0-9a-fA-F]{3,8})\b/g)) {
    if (/^\d+$/.test(m[1])) continue;
    return true;
  }
  return false;
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "vendor") continue;
      walk(p, out);
    } else if (/\.(module\.css|css)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

export function scanCssViolations(rootDir = root) {
  const files = SCAN_ROOTS.flatMap((d) => walk(d)).filter((f) => !isSkipped(f));
  const violations = [];

  for (const file of files) {
    const rel = relative(rootDir, file).replaceAll("\\", "/");
    const skipFrac = FRAC_REM_ALLOW_FILES.has(rel);
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(ALLOW_MARK)) continue;
      const code = line
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/, "");
      if (hasColorHex(code)) {
        violations.push({ rel, line: i + 1, kind: "hex", text: line.trim() });
      }
      if (!skipFrac && FRAC_REM_RE.test(code)) {
        violations.push({
          rel,
          line: i + 1,
          kind: "frac-rem",
          text: line.trim(),
        });
      }
    }
  }
  return { files, violations };
}

export function scanDialogArchitectureViolations(rootDir = root) {
  const violations = [];
  const dialogsDirRel = "apps/web/src/shells/timeline/dialogs";
  const dialogsDirAbs = join(rootDir, dialogsDirRel);

  // Check 1: Forbidden CSS files in dialogs directory
  try {
    const entries = readdirSync(dialogsDirAbs);
    for (const entry of entries) {
      if (/\.(module\.css|css)$/.test(entry)) {
        violations.push({
          rel: `${dialogsDirRel}/${entry}`,
          line: 1,
          kind: "forbidden-dialog-css",
          text: `Forbidden standalone CSS in dialogs directory. Dialogs must reuse TimelineShell.module.css or @stagesync/ui.`,
        });
      }
    }
  } catch {}

  // Check 2: Forbidden inline styles (style={{...) in dialog components
  try {
    const entries = readdirSync(dialogsDirAbs);
    for (const entry of entries) {
      if (!/\.tsx$/.test(entry) || entry.includes(".test.")) continue;
      const filePath = join(dialogsDirAbs, entry);
      const rel = relative(rootDir, filePath).replaceAll("\\", "/");
      const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("style={{")) {
          violations.push({
            rel,
            line: i + 1,
            kind: "forbidden-inline-style",
            text: `Forbidden inline style: "${line.trim()}". Dialogs must reuse TimelineShell.module.css or @stagesync/ui without inline styles.`,
          });
        }
      }
    }
  } catch {}

  return violations;
}

export function scanNavButtonsConsistency(rootDir = root) {
  const violations = [];
  const targets = [
    {
      file: "apps/web/src/shells/admin/AdminShell.module.css",
      selectors: [".appJump a", ".appJumpMuted"],
    },
    {
      file: "apps/web/src/shells/client/ClientShell.module.css",
      selectors: [".appJump a", ".appJumpMuted"],
    },
    {
      file: "apps/web/src/shells/components/AppHeader.module.css",
      selectors: [".appJump a", ".appJumpMuted"],
    },
    {
      file: "apps/web/src/shells/components/OperatorNav.module.css",
      selectors: [".segmentLink,\n.segmentMuted,\n.segmentChip"],
    },
  ];

  const requiredTokens = [
    "display: inline-flex",
    "align-items: center",
    "box-sizing: border-box",
    "min-height: var(--ss-touch-min)",
    "line-height: var(--ss-leading-compact)",
  ];

  for (const { file, selectors } of targets) {
    const filePath = join(rootDir, file);
    let content = "";
    try {
      content = readFileSync(filePath, "utf8");
    } catch {
      violations.push({
        rel: file,
        line: 1,
        kind: "missing-file",
        text: `File ${file} could not be read for nav button consistency check.`,
      });
      continue;
    }

    for (const selector of selectors) {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, "m");
      const match = content.match(regex);
      if (!match) {
        violations.push({
          rel: file,
          line: 1,
          kind: "missing-selector",
          text: `Selector "${selector}" not found as top-level rule in ${file}`,
        });
        continue;
      }
      const block = match[1];
      for (const token of requiredTokens) {
        if (!block.includes(token)) {
          violations.push({
            rel: file,
            line: 1,
            kind: "inconsistent-nav-token",
            text: `Selector "${selector}" in ${file} is missing canonical token "${token}". Cross-shell navigation buttons must maintain unified dimensions.`,
          });
        }
      }
    }
  }

  return violations;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { files, violations: cssViolations } = scanCssViolations(root);
  const archViolations = scanDialogArchitectureViolations(root);
  const navViolations = scanNavButtonsConsistency(root);
  const allViolations = [
    ...cssViolations,
    ...archViolations,
    ...navViolations,
  ];

  if (allViolations.length) {
    console.error(`lint-ss-css: ${allViolations.length} violation(s):\n`);
    for (const v of allViolations.slice(0, 100)) {
      console.error(`  [${v.kind}] ${v.rel}:${v.line}`);
      console.error(`    ${v.text}`);
    }
    if (allViolations.length > 100) {
      console.error(`  … and ${allViolations.length - 100} more`);
    }
    console.error(
      `\nUse --ss-* tokens, or mark a justified line with /* ${ALLOW_MARK} */.`,
    );
    process.exit(1);
  }

  console.log(`lint-ss-css: ok (${files.length} files, dialogs and nav buttons verified)`);
}
