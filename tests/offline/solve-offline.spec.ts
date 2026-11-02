import { expect, test } from "@playwright/test";

test("a cold offline reload still loads the precached WASM solver and reports an outcome", async ({
  page,
  context
}) => {
  await page.goto("/workbench");
  // An active worker means the Workbox install step precached the app shell and the .wasm asset.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await context.setOffline(true);
  await page.reload();
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  // navigator.onLine is unreliable under emulation; prove the network is down with an uncached fetch.
  const networkReachable = await page.evaluate(() =>
    fetch(`/offline-probe-${Date.now()}.json`, { cache: "no-store" }).then(
      () => true,
      () => false
    )
  );
  expect(networkReachable).toBe(false);
  const outcome = page.locator('[data-od-id="landing-outcome"]');
  await expect(outcome.getByRole("heading", { name: "Outcome" })).toBeVisible();
  await expect(outcome).toHaveAttribute("data-tone", "none");

  await page.getByRole("button", { name: "Solve run" }).click();

  await expect(outcome).not.toHaveAttribute("data-tone", "none", { timeout: 30_000 });
  await expect(outcome.locator(".verdict-title")).not.toBeEmpty();
});
