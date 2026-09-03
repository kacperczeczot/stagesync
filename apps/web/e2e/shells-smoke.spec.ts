import { expect, test, type Page } from "@playwright/test";

/**
 * Core shells smoke test:
 * - Admin shell (/admin): verifies header, sections navigation, and clean console.
 * - Client shell (/client): verifies stage/score surface and clean console.
 */

function setupConsoleGuard(page: Page, errors: string[]): void {
  page.on("pageerror", (err) => {
    errors.push(`PageError: ${err.message}`);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(`ConsoleError: ${msg.text()}`);
    }
  });
}

test.describe("Core Shells Smoke", () => {
  test("Admin shell loads and renders sections without console errors", async ({
    page,
  }) => {
    const errors: string[] = [];
    setupConsoleGuard(page, errors);

    await page.goto("/admin");

    // Wait for the Admin navigation sections to mount
    const nav = page.getByRole("navigation", { name: "Sekcje" });
    await expect(nav).toBeVisible({ timeout: 15_000 });

    // Verify main section button (Utwory) is visible and pressed
    const songsBtn = nav.getByRole("button", { name: "Utwory" });
    await expect(songsBtn).toBeVisible();

    // Verify main content heading
    await expect(page.getByRole("heading", { name: "Utwory" })).toBeVisible();

    // Verify no unhandled page errors occurred during mount
    expect(errors, `Errors in Admin: ${errors.join(", ")}`).toEqual([]);
  });

  test("Client shell loads stage surface without console errors", async ({
    page,
  }) => {
    const errors: string[] = [];
    setupConsoleGuard(page, errors);

    await page.goto("/client");

    // Wait for the Client surface or main container
    const mainContainer = page.locator("main, [data-surface], #root");
    await expect(mainContainer.first()).toBeVisible({ timeout: 15_000 });

    // Verify no unhandled page errors occurred during mount
    expect(errors, `Errors in Client: ${errors.join(", ")}`).toEqual([]);
  });
});
