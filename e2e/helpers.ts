import { expect, type Page } from "@playwright/test";

/** Fresh address per run: the local stack is reset between runs, but a retry
 *  inside one run must not collide with the account the first attempt created. */
export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.test`;
}

export const PASSWORD = "motdepasse2026";

type Role = "candidate" | "employer";

/**
 * Signs a new user up through the real form.
 *
 * The register form's labels are not tied to their inputs (no htmlFor/id), so
 * these go through placeholders rather than getByLabel — worth fixing in the
 * component, but the test should not pretend the markup is something it isn't.
 *
 * Local Supabase has `enable_confirmations = false`, so signup returns a
 * session immediately and the app redirects to the dashboard. With
 * confirmations on — the likely production setting — the form would instead
 * show "Vérifiez votre boîte mail" and this helper would need the mail step.
 */
export async function register(
  page: Page,
  role: Role,
  fullName: string,
  email = uniqueEmail(role)
) {
  await page.goto("/fr/register");

  await page.locator("select").selectOption(role);
  await page.getByPlaceholder("Awa Dacosta").fill(fullName);
  await page.getByPlaceholder("email@exemple.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(PASSWORD);
  await page.getByPlaceholder("Congo-Brazzaville").fill("Congo-Brazzaville");
  await page.getByPlaceholder("Brazzaville", { exact: true }).fill("Brazzaville");
  await page.getByPlaceholder("Bacongo").fill("Bacongo");

  await page.getByRole("button", { name: "Créer mon compte" }).click();

  const dashboard = role === "employer" ? "/dashboard/employer" : "/dashboard/candidate";
  await page.waitForURL(new RegExp(`/fr${dashboard}`), { timeout: 30_000 });

  return { email, password: PASSWORD };
}

export async function signIn(page: Page, email: string) {
  await page.goto("/fr/login");
  await page.getByPlaceholder("email@exemple.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

/** Smallest valid PNG, so the avatar upload exercises the real storage path
 *  and the real MIME check rather than a stubbed one. */
export const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64"
);
