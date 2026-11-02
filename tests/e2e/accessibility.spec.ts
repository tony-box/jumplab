import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const route of ["/workbench", "/library", "/designer", "/report", "/validation"]) {
  test(`${route} has no serious axe violations`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact ?? "")
      )
    ).toEqual([]);
  });
}

test("workbench jump controls and canvases expose keyboard alternatives", async ({ page }) => {
  await page.goto("/workbench");
  await expect(page.getByRole("tab", { name: "Rider" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Bike" })).toHaveCount(0);
  const entrySpeed = page.getByLabel("Entry speed");
  await entrySpeed.focus();
  await expect(entrySpeed).toBeFocused();
  await expect(page.getByText(/Frame 0: bike at/)).toBeAttached();
  await page.goto("/designer");
  await expect(page.getByText(/Pose sample at/)).toBeAttached();
});

test("workbench camera controls are named and keyboard operable", async ({ page }) => {
  await page.goto("/workbench");
  await expect(page.getByRole("button", { name: "Follow" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.getByRole("button", { name: "Pan & Zoom" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset view" })).toBeVisible();

  const stage = page.getByLabel("Interactive jump simulation stage");
  await stage.focus();
  await expect(stage).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("camera pan-zoom")).toBeVisible();
});

test("workbench exposes contact and model data-source honesty text", async ({ page }) => {
  await page.goto("/workbench");
  await expect(page.locator('[data-od-id="contact-readout"]')).toContainText("contact unavailable");
  await expect(page.locator('[data-od-id="terrain-status"]')).toContainText("terrain ready");
  await expect(
    page.getByText(
      /Rider posture and movement and suspension setup are shown, but are not yet coupled to takeoff, flight, landing, or contact loads/i
    )
  ).toBeVisible();
});

test("calculated elbow and schematic bike disclosure are exposed as accessible text, not canvas-only pixels", async ({
  page
}) => {
  await page.goto("/designer");
  await expect(page.getByText(/Calculated\s+elbow/)).toBeAttached();
  await expect(page.getByText(/Bike fit is shown schematically/)).toBeAttached();
  await expect(page.getByLabel(/^elbow$/i)).toHaveCount(0);

  await page.goto("/workbench");
  await expect(page.getByText(/Bike fit is shown schematically/)).toBeAttached();
});

test("all routes expose visible keyboard focus and one named primary action", async ({ page }) => {
  for (const route of ["/workbench", "/library", "/designer", "/report", "/validation"]) {
    await page.goto(route);
    const primary = page.locator(".topbar .btn.primary");
    await expect(primary).toHaveCount(1);
    await expect(primary).not.toHaveAccessibleName("");
    if (await primary.isEnabled()) {
      await primary.focus();
      await expect(primary).toBeFocused();
      const outline = await primary.evaluate((element) => getComputedStyle(element).outlineStyle);
      expect(outline).not.toBe("none");
    } else {
      await expect(primary).toBeDisabled();
    }
  }
});

test("Designer mode, validation, numeric fields, and keyframes are keyboard isolated", async ({
  page
}) => {
  await page.goto("/designer");

  const poseMode = page.getByRole("radio", { name: "Pose" });
  await poseMode.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("radio", { name: "Bike" })).toHaveAttribute("aria-checked", "true");

  const reach = page.getByLabel("Reach");
  await reach.focus();
  await page.keyboard.press("ArrowUp");
  await expect(reach).toBeFocused();
  await expect(page.locator('[data-od-id="design-conflict-summary"]')).toHaveAttribute(
    "aria-live",
    "polite"
  );

  await page.getByRole("radio", { name: "Pose" }).click();
  const listbox = page.getByRole("listbox", { name: "Keyframe list" });
  await listbox.focus();
  await page.keyboard.press("ArrowDown");
  await expect(listbox.getByRole("option", { selected: true })).toHaveCount(1);

  const apply = page.locator("#apply-clip");
  if (await apply.isDisabled()) {
    await expect(page.locator('[data-od-id="apply-disabled-reason"]')).toBeVisible();
  }
});

test("validation announces progress and provides color-independent chart equivalents", async ({
  page
}) => {
  await page.goto("/validation");
  await page.locator('[data-od-id="run-suite"]').click();
  await expect(page.locator('[data-od-id="validation-progress"]')).toHaveAttribute(
    "role",
    "status"
  );
  await expect
    .poll(() => page.locator('[data-od-id="suite-summary"]').getAttribute("data-suite-status"))
    .toBe("completed");
  await expect(page.locator('[data-od-id="convergence-chart"] svg')).toHaveAttribute("role", "img");
  await expect(page.locator('[data-od-id="convergence-table"]')).toBeVisible();
  const statuses = await page
    .locator('[data-od-id="analytical-table"] td[data-column="status"]')
    .allTextContents();
  expect(statuses.length).toBeGreaterThan(0);
  expect(statuses.every((status) => /pass|fail|awaiting core/i.test(status))).toBe(true);
});
