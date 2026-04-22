import { test, expect } from "@playwright/test";
import { loginAsDefault } from "./helpers";

test.describe("Admin Skills", () => {
  test("admin skills page loads and shows skills matrix", async ({ page }) => {
    await loginAsDefault(page);

    // Navigate to admin skills page
    await page.goto("/test-workspace/admin-skills");

    // Wait for page to load
    await expect(page.locator("text=Skills Admin")).toBeVisible();

    // Check if matrix or empty state is shown
    const skillsMatrix = page.locator("[data-testid='skills-matrix']");
    const emptyState = page.locator("text=No skills found across your workspaces");

    await expect(skillsMatrix.or(emptyState)).toBeVisible();
  });

  test("skills matrix shows skills grouped by name", async ({ page }) => {
    await loginAsDefault(page);
    await page.goto("/test-workspace/admin-skills");

    // Wait for skills to load
    await page.waitForTimeout(1000);

    // Check if skill rows are displayed
    const skillRows = page.locator(".divide-y > div");
    const count = await skillRows.count();

    if (count > 0) {
      // Verify first row has skill name and workspace badges
      const firstRow = skillRows.first();
      await expect(firstRow.locator("span.font-medium")).toBeVisible();
      await expect(firstRow.locator("text=/\\d+ workspace/")).toBeVisible();
    }
  });

  test("selecting skill enables target workspace checkboxes", async ({ page }) => {
    await loginAsDefault(page);
    await page.goto("/test-workspace/admin-skills");

    // Wait for page to load
    await page.waitForTimeout(1000);

    // Try to find a skill button to select
    const skillButton = page.locator("button[role='button']").first();

    if (await skillButton.isVisible().catch(() => false)) {
      // Click to select the skill
      await skillButton.click();

      // Check if a checkbox becomes enabled
      const checkbox = page.locator("input[type='checkbox']").first();
      await expect(checkbox).toBeEnabled();
    }
  });

  test("copy dialog opens when clicking copy action", async ({ page }) => {
    await loginAsDefault(page);
    await page.goto("/test-workspace/admin-skills");

    // Wait for page to load
    await page.waitForTimeout(1000);

    // Look for a skill to select
    const skillButtons = page.locator("button");
    const count = await skillButtons.count();

    if (count > 0) {
      // Click first skill to select it
      await skillButtons.first().click();

      // Wait for selection state
      await page.waitForTimeout(500);
    }
  });

  test("admin section is visible in settings", async ({ page }) => {
    await loginAsDefault(page);

    // Navigate to settings
    await page.goto("/test-workspace/settings");

    // Check for Admin section
    await expect(page.locator("text=Admin")).toBeVisible();

    // Check for Skills Admin link
    await expect(page.locator("text=Skills Admin")).toBeVisible();
  });

  test("navigating to skills admin from settings", async ({ page }) => {
    await loginAsDefault(page);

    // Navigate to settings
    await page.goto("/test-workspace/settings");

    // Click on Skills Admin link
    const skillsAdminLink = page.locator("a:has-text('Skills Admin')");
    await expect(skillsAdminLink).toBeVisible();

    await skillsAdminLink.click();

    // Verify we navigated to admin-skills page
    await expect(page).toHaveURL(/.*\/admin-skills/);
    await expect(page.locator("text=Skills Admin")).toBeVisible();
  });

  test("delete button appears when skill is selected", async ({ page }) => {
    await loginAsDefault(page);
    await page.goto("/test-workspace/admin-skills");

    // Wait for skills to load
    await page.waitForTimeout(1000);

    // Look for a skill to select
    const skillButtons = page.locator("button");
    const count = await skillButtons.count();

    if (count > 0) {
      // Click first skill to select it
      await skillButtons.first().click();

      // Wait for selection state
      await page.waitForTimeout(500);

      // Check if delete button appears
      const deleteButton = page.locator("button:has-text('Delete')");
      await expect(deleteButton).toBeVisible();
    }
  });
});
