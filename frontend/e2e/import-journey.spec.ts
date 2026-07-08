import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Full browser journeys against the real running stack (see
 * playwright.config.ts — Playwright boots both servers).
 *
 * The no-key journey exercises everything up to the AI boundary: real
 * multer upload, real PapaParse preview, the confirm dialog, and the
 * product's 503 error path. The happy path (progress → results) needs a
 * real model and auto-skips unless OPENAI_API_KEY is set.
 */

const SAMPLES = path.resolve(__dirname, "..", "..", "samples");

test("upload → preview → confirm → clear error when no AI key is configured", async ({ page }) => {
  test.skip(Boolean(process.env["OPENAI_API_KEY"]), "covered by the happy-path journey");

  await page.goto("/");
  await page.getByRole("link", { name: /start importing/i }).click();

  // Upload step: real file through the dropzone's input into multer.
  await expect(page).toHaveURL(/\/import\/upload/);
  await page.locator('input[type="file"]').setInputFiles(path.join(SAMPLES, "leads-messy.csv"));
  await expect(page.getByText("leads-messy.csv")).toBeVisible();
  await page.getByRole("button", { name: /upload & continue/i }).click();

  // Preview step: the hostile sample's synonym headers render in the table.
  await expect(page).toHaveURL(/\/import\/preview/, { timeout: 15_000 });
  await expect(page.getByRole("columnheader", { name: "Correo" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Primary Mobile" })).toBeVisible();

  // Confirm dialog gates the AI spend.
  await page.getByRole("button", { name: /start ai import/i }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Start the AI import?");
  await page.getByRole("button", { name: "Start import" }).click();

  // Without a key the API answers 503 — the product must say so plainly,
  // not spin forever or crash.
  await expect(page).toHaveURL(/\/import\/progress/);
  await expect(page.getByText(/could not start the import/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/AI provider is not configured/i)).toBeVisible();
  await page.getByRole("button", { name: /back to preview/i }).click();
  await expect(page).toHaveURL(/\/import\/preview/);
});

test("full happy path: upload → preview → live progress → results → export", async ({ page }) => {
  test.skip(
    !process.env["OPENAI_API_KEY"],
    "needs a real model — set OPENAI_API_KEY to run the full journey",
  );

  await page.goto("/import/upload");
  await page.locator('input[type="file"]').setInputFiles(path.join(SAMPLES, "leads-standard.csv"));
  await page.getByRole("button", { name: /upload & continue/i }).click();

  await expect(page).toHaveURL(/\/import\/preview/, { timeout: 15_000 });
  await page.getByRole("button", { name: /start ai import/i }).click();
  await page.getByRole("button", { name: "Start import" }).click();

  // Live progress (SSE) → auto-navigate to results when the job completes.
  await expect(page).toHaveURL(/\/import\/progress/);
  await expect(page).toHaveURL(/\/import\/result/, { timeout: 180_000 });

  // Results: stats tiles rendered, records tab populated, export available.
  await expect(page.getByText(/imported/i).first()).toBeVisible();
  await expect(page.getByRole("tab", { name: /records/i })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /export/i }).click();
  expect((await download).suggestedFilename()).toBe("groweasy-import.csv");
});
