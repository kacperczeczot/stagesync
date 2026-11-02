import assert from "node:assert/strict";
import {
  hasColorHex,
  scanCssViolations,
  scanDialogArchitectureViolations,
  scanNavButtonsConsistency,
} from "./lint-ss-css.mjs";

// Test 1: hasColorHex correctly identifies HEX codes
assert.equal(hasColorHex("color: #f59e0b;"), true);
assert.equal(hasColorHex("border: 1px solid #ffffff;"), true);
assert.equal(hasColorHex("background: var(--ss-color-bg);"), false);
assert.equal(hasColorHex("color: rgba(255, 255, 255, 0.5);"), false);

// Test 2: Current repository has 0 CSS violations
const { violations: cssViolations } = scanCssViolations();
assert.equal(
  cssViolations.length,
  0,
  `Expected 0 CSS violations, got: ${JSON.stringify(cssViolations, null, 2)}`,
);

// Test 3: Current repository has 0 dialog architecture violations (no forbidden CSS and no inline styles)
const dialogViolations = scanDialogArchitectureViolations();
assert.equal(
  dialogViolations.length,
  0,
  `Expected 0 dialog violations, got: ${JSON.stringify(dialogViolations, null, 2)}`,
);

// Test 4: Current repository has 0 nav buttons consistency violations
const navViolations = scanNavButtonsConsistency();
assert.equal(
  navViolations.length,
  0,
  `Expected 0 nav button consistency violations, got: ${JSON.stringify(navViolations, null, 2)}`,
);

console.log("lint-ss-css.test.mjs: ok");
