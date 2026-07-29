import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Visual demo journey for docs/screenshots/demo.gif.
 * Playwright boots both servers (see playwright.config.ts).
 */
const SAMPLES = path.resolve(__dirname, "..", "..", "samples");

test("record product demo for README", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.resolve(__dirname, "../../docs/screenshots/home.png") });

  await page.getByRole("link", { name: /start importing/i }).click();
  await expect(page).toHaveURL(/\/import\/upload/);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.resolve(__dirname, "../../docs/screenshots/upload.png") });

  await page.locator('input[type="file"]').setInputFiles(path.join(SAMPLES, "leads-messy.csv"));
  await expect(page.getByText("leads-messy.csv")).toBeVisible();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /upload & continue/i }).click();

  await expect(page).toHaveURL(/\/import\/preview/, { timeout: 20_000 });
  await expect(page.getByRole("columnheader", { name: "Correo" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Primary Mobile" })).toBeVisible();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.resolve(__dirname, "../../docs/screenshots/preview.png") });

  await page.getByRole("button", { name: /start ai import/i }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Start the AI import?");
  await page.waitForTimeout(1500);

  if (process.env["OPENAI_API_KEY"]) {
    await page.getByRole("button", { name: "Start import" }).click();
    await expect(page).toHaveURL(/\/import\/progress/);
    await expect(page).toHaveURL(/\/import\/result/, { timeout: 180_000 });
    await page.waitForTimeout(2000);
  } else {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1000);
  }
});
