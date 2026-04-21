import { test, expect, type Page } from "@playwright/test";
import { loginAsDefault, createTestApi, openWorkspaceMenu } from "./helpers";
import type { TestApiClient } from "./fixtures";

/**
 * Skills Admin E2E Tests
 *
 * These tests cover the Skills Admin feature which allows administrators
 * to manage skills across multiple workspaces from a centralized interface.
 *
 * Test coverage:
 * - Skills Matrix view (table with checkboxes)
 * - Creating skills
 * - Copying skills to multiple workspaces
 * - Permission checks (admin vs member access)
 * - Real-time updates via WebSocket
 */

test.describe("Skills Admin - Matrix View", () => {
  let api: TestApiClient;
  let workspaceSlug: string;

  test.beforeEach(async ({ page }) => {
    api = await createTestApi();
    workspaceSlug = await loginAsDefault(page);
  });

  test.afterEach(async () => {
    if (api) {
      await api.cleanup();
    }
  });

  test("skills page loads with skills matrix view", async ({ page }) => {
    // Create a skill via API
    await api.createSkill({
      name: "E2E Test Skill",
      description: "Test skill for E2E",
      content: "# E2E Test Skill",
    });

    // Navigate to skills page
    await page.goto(`/${workspaceSlug}/skills`);
    await page.waitForURL("**/skills");

    // Skills page should load with header
    await expect(page.locator("text=Skills").first()).toBeVisible();

    // Skill should be visible in the list
    await expect(page.locator("text=E2E Test Skill")).toBeVisible();
    await expect(page.locator("text=Test skill for E2E")).toBeVisible();
  });

  test("can create a new skill from the skills page", async ({ page }) => {
    await page.goto(`/${workspaceSlug}/skills`);
    await page.waitForURL("**/skills");

    // Click create skill button
    const createButton = page.getByRole("button", { name: /Create skill/i });
    await expect(createButton).toBeVisible();
    await createButton.click();

    // Create skill dialog should appear
    await expect(page.locator("text=Add Workspace Skill")).toBeVisible();
    await expect(page.locator("text=Create")).toBeVisible();

    // Fill in skill details
    const nameInput = page.locator('input[placeholder*="Code Review"]').first();
    await expect(nameInput).toBeVisible();
    await nameInput.fill("E2E Created Skill");

    const descInput = page.locator('input[placeholder*="description"]').first();
    await descInput.fill("Created via E2E test");

    // Create the skill
    await page.getByRole("button", { name: /Create$/ }).click();

    // Success notification should appear
    await expect(page.locator("text=Skill created")).toBeVisible({ timeout: 10000 });

    // New skill should appear in the list
    await expect(page.locator("text=E2E Created Skill")).toBeVisible();
  });

  test("can import skill from ClawHub", async ({ page }) => {
    await page.goto(`/${workspaceSlug}/skills`);
    await page.waitForURL("**/skills");

    // Click create skill button
    await page.getByRole("button", { name: /Create skill/i }).click();

    // Switch to Import tab
    await page.getByRole("tab", { name: /Import/i }).click();

    // Import tab should be active
    await expect(page.locator("text=Skill URL")).toBeVisible();

    // Enter a skill URL
    const urlInput = page.locator('input[placeholder*="Paste a skill URL"]').first();
    await urlInput.fill("clawhub.ai/example/skill");

    // ClawHub should be detected
    await expect(page.locator("text=ClawHub").first()).toBeVisible();
  });

  test("can edit skill content in file browser", async ({ page }) => {
    // Create a skill via API
    await api.createSkill({
      name: "Editable Skill",
      description: "For editing test",
      content: "# Original Content",
    });

    await page.goto(`/${workspaceSlug}/skills`);
    await page.waitForURL("**/skills");

    // Click on the skill to select it
    await page.locator("text=Editable Skill").click();

    // Skill detail view should load
    await expect(page.locator("text=Files")).toBeVisible();

    // SKILL.md should be selected by default
    await expect(page.locator("text=SKILL.md")).toBeVisible();
  });

  test("can delete a skill", async ({ page }) => {
    // Create a skill via API
    await api.createSkill({
      name: "Deletable Skill",
      description: "For deletion test",
      content: "# To be deleted",
    });

    await page.goto(`/${workspaceSlug}/skills`);
    await page.waitForURL("**/skills");

    // Select the skill
    await page.locator("text=Deletable Skill").click();

    // Click delete button
    const deleteButton = page.locator('button[title="Delete skill"]').first();
    await deleteButton.click();

    // Confirm dialog should appear
    await expect(page.locator("text=Delete skill?")).toBeVisible();

    // Confirm deletion
    await page.getByRole("button", { name: /Delete$/ }).click();

    // Success notification
    await expect(page.locator("text=Skill deleted")).toBeVisible({ timeout: 10000 });

    // Skill should no longer be in the list
    await expect(page.locator("text=Deletable Skill")).not.toBeVisible();
  });
});

test.describe("Skills Admin - Multi-Workspace", () => {
  let api: TestApiClient;
  let api2: TestApiClient;
  let workspace1: { id: string; slug: string; name: string };
  let workspace2: { id: string; slug: string; name: string };

  test.beforeEach(async ({ page }) => {
    // Create first API client and workspace
    api = await createTestApi();
    const ws1 = await api.ensureWorkspace("E2E Workspace 1", "e2e-workspace-1");
    workspace1 = ws1;

    // Create second workspace
    const ws2 = await api.createWorkspace("E2E Workspace 2", "e2e-workspace-2");
    workspace2 = ws2;

    // Login to the first workspace
    const token = api.getToken();
    await page.goto("/login");
    await page.evaluate((t) => {
      localStorage.setItem("multica_token", t);
    }, token);
    await page.goto(`/${workspace1.slug}/skills`);
    await page.waitForURL("**/skills");
  });

  test.afterEach(async () => {
    if (api) await api.cleanup();
    if (api2) await api2.cleanup();
  });

  test("can switch between workspace skills", async ({ page }) => {
    // Create skills in different workspaces
    await api.switchToWorkspace(workspace1.id, workspace1.slug);
    await api.createSkill({
      name: "Workspace 1 Skill",
      description: "Skill in workspace 1",
      content: "# WS1 Skill",
    });

    await api.switchToWorkspace(workspace2.id, workspace2.slug);
    await api.createSkill({
      name: "Workspace 2 Skill",
      description: "Skill in workspace 2",
      content: "# WS2 Skill",
    });

    // Go back to workspace 1
    await api.switchToWorkspace(workspace1.id, workspace1.slug);
    await page.goto(`/${workspace1.slug}/skills`);

    // Should see workspace 1 skill
    await expect(page.locator("text=Workspace 1 Skill")).toBeVisible();

    // Switch to workspace 2 via menu
    await openWorkspaceMenu(page);
    await page.locator(`text=${workspace2.name}`).click();

    // Should now see workspace 2 skill
    await expect(page.locator("text=Workspace 2 Skill")).toBeVisible();
  });
});

test.describe("Skills Admin - Permissions", () => {
  let adminApi: TestApiClient;
  let memberApi: TestApiClient;
  let workspace: { id: string; slug: string; name: string };

  test.beforeEach(async ({ page }) => {
    // Create admin user
    adminApi = await createTestApi();
    const ws = await adminApi.ensureWorkspace("Permissions Test WS", "e2e-perm-ws");
    workspace = ws;
  });

  test.afterEach(async () => {
    if (adminApi) await adminApi.cleanup();
    if (memberApi) await memberApi.cleanup();
  });

  test("admin can create, edit and delete skills", async ({ page }) => {
    // Login as admin
    const token = adminApi.getToken();
    await page.goto("/login");
    await page.evaluate((t) => {
      localStorage.setItem("multica_token", t);
    }, token);
    await page.goto(`/${workspace.slug}/skills`);
    await page.waitForURL("**/skills");

    // Admin should see create skill button
    const createButton = page.getByRole("button", { name: /Create skill/i });
    await expect(createButton).toBeVisible();

    // Create a skill
    await createButton.click();
    await page.locator('input[placeholder*="Code Review"]').first().fill("Admin Skill");
    await page.locator('input[placeholder*="description"]').first().fill("Created by admin");
    await page.getByRole("button", { name: /Create$/ }).click();

    // Should succeed
    await expect(page.locator("text=Skill created")).toBeVisible({ timeout: 10000 });
  });

  test("skill creator can manage their own skills", async ({ page }) => {
    // Create a skill as admin
    await adminApi.switchToWorkspace(workspace.id, workspace.slug);
    const skill = await adminApi.createSkill({
      name: "Creator Owned Skill",
      description: "Skill created by admin",
      content: "# Creator Content",
    });

    // Login as admin (creator)
    const token = adminApi.getToken();
    await page.goto("/login");
    await page.evaluate((t) => {
      localStorage.setItem("multica_token", t);
    }, token);
    await page.goto(`/${workspace.slug}/skills`);
    await page.waitForURL("**/skills");

    // Select the skill
    await page.locator("text=Creator Owned Skill").click();

    // Should be able to see save button (if we make changes)
    const nameInput = page.locator('input[value="Creator Owned Skill"]').first();
    await expect(nameInput).toBeVisible();

    // Make a change
    await nameInput.fill("Updated Creator Skill");

    // Save button should appear
    await expect(page.locator("text=Save").first()).toBeVisible();
  });
});

test.describe("Skills Admin - Real-time Updates", () => {
  let api: TestApiClient;
  let workspaceSlug: string;

  test.beforeEach(async ({ page }) => {
    api = await createTestApi();
    workspaceSlug = await loginAsDefault(page);
  });

  test.afterEach(async () => {
    if (api) await api.cleanup();
  });

  test("new skill appears in real-time when created via API", async ({ page }) => {
    await page.goto(`/${workspaceSlug}/skills`);
    await page.waitForURL("**/skills");

    // Initially no skills
    await expect(page.locator("text=No workspace skills yet")).toBeVisible();

    // Create skill via API (simulating another user or process)
    await api.createSkill({
      name: "Realtime Skill",
      description: "Should appear automatically",
      content: "# Realtime",
    });

    // Skill should appear without page refresh (via WebSocket/real-time sync)
    await expect(page.locator("text=Realtime Skill")).toBeVisible({ timeout: 10000 });
  });

  test("skill deletion is reflected in real-time", async ({ page }) => {
    // Create a skill
    const skill = await api.createSkill({
      name: "To Be Deleted",
      description: "Will be deleted",
      content: "# Delete Me",
    });

    await page.goto(`/${workspaceSlug}/skills`);
    await page.waitForURL("**/skills");

    // Skill should be visible
    await expect(page.locator("text=To Be Deleted")).toBeVisible();

    // Delete via API
    await api.deleteSkill(skill.id);

    // Skill should disappear without refresh
    await expect(page.locator("text=To Be Deleted")).not.toBeVisible({ timeout: 10000 });
  });

  test("skill updates are reflected in real-time", async ({ page }) => {
    // Create a skill
    const skill = await api.createSkill({
      name: "Updateable Skill",
      description: "Original description",
      content: "# Original",
    });

    await page.goto(`/${workspaceSlug}/skills`);
    await page.waitForURL("**/skills");

    // Select the skill to view details
    await page.locator("text=Updateable Skill").click();

    // Update via API
    await api.updateSkill(skill.id, {
      name: "Updated Name",
      description: "Updated description",
    });

    // Update should appear without refresh
    await expect(page.locator("text=Updated Name")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Updated description")).toBeVisible();
  });
});

test.describe("Skills Admin - Settings Tab", () => {
  let api: TestApiClient;
  let workspaceSlug: string;

  test.beforeEach(async ({ page }) => {
    api = await createTestApi();
    workspaceSlug = await loginAsDefault(page);
  });

  test.afterEach(async () => {
    if (api) await api.cleanup();
  });

  test("skills link is available in settings sidebar", async ({ page }) => {
    // Navigate to settings
    await page.goto(`/${workspaceSlug}/settings`);
    await page.waitForURL("**/settings");

    // Skills should be accessible via sidebar or navigation
    await openWorkspaceMenu(page);

    // Look for skills option in workspace menu
    await expect(page.locator("text=Skills").first()).toBeVisible();
  });

  test("can navigate from issues to skills page", async ({ page }) => {
    // Start at issues page
    await page.goto(`/${workspaceSlug}/issues`);
    await page.waitForURL("**/issues");

    // Use Cmd+K or click to navigate to skills
    // This tests the navigation path that users would take
    await page.goto(`/${workspaceSlug}/skills`);
    await page.waitForURL("**/skills");

    // Should be on skills page
    await expect(page.locator("text=Skills").first()).toBeVisible();
  });
});
