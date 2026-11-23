import { expect, test } from "@playwright/test";

test("protected pages send you to the login page", async ({ page }) => {
  await page.goto("/operator/dealers");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Log in to DealerReply" })).toBeVisible();
});

test("an unknown email sees the same 'check your email' page", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByRole("button", { name: "Email me a login link" }).click();
  await expect(page).toHaveURL(/\/login\/check-email/);
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
});
