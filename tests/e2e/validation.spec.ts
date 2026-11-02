import { expect, test } from "@playwright/test";

const summaryNumbers = async (page: Parameters<typeof test>[0]["page"]) => {
  return page.evaluate(() => {
    const read = (id: string) => {
      const node = document.querySelector(`[data-od-id="${id}"]`);
      if (!node) return NaN;
      return Number((node.textContent ?? "").replace(/[^0-9.-]/g, ""));
    };

    return {
      checks: read("summary-checks"),
      passing: read("summary-passing"),
      failing: read("summary-failing"),
      awaitingCore: read("summary-awaiting-core"),
      running: read("summary-running")
    };
  });
};

test("validation route honors data-od-id contract, keyboard timestep, progress, reconciliation, trace/hash wrapping, and pending gates", async ({
  page
}) => {
  await page.goto("/validation");

  await expect(page.locator('[data-od-id="validation-page"]')).toBeVisible();
  await expect(page.locator('[data-od-id="timestep-select"]')).toBeVisible();
  await expect(page.locator('[data-od-id="run-suite"]')).toBeVisible();
  await expect(page.locator('[data-od-id="suite-summary"]')).toBeVisible();
  await expect(page.locator('[data-od-id="sec-analytical"]')).toBeVisible();
  await expect(page.locator('[data-od-id="analytical-table"]')).toBeVisible();
  await expect(page.locator('[data-od-id="sec-convergence"]')).toBeVisible();
  await expect(page.locator('[data-od-id="convergence-table"]')).toBeVisible();
  await expect(page.locator('[data-od-id="convergence-note"]')).toBeVisible();
  await expect(page.locator('[data-od-id="sec-determinism"]')).toBeVisible();
  await expect(page.locator('[data-od-id="determinism-table"]')).toBeVisible();
  await expect(page.locator('[data-od-id="sec-pending"]')).toBeVisible();
  await expect(page.locator('[data-od-id="pending-table"]')).toBeVisible();

  await expect(page.locator(".topbar .btn.primary")).toHaveCount(1);
  await expect(page.locator(".topbar .btn.primary")).toHaveAttribute("data-od-id", "run-suite");

  const before = await page.locator('[data-od-id="timestep-select"]').inputValue();
  await page.locator('[data-od-id="timestep-select"]').focus();
  await page.keyboard.press("ArrowDown");
  const after = await page.locator('[data-od-id="timestep-select"]').inputValue();
  expect(after).not.toBe(before);

  await page.locator('[data-od-id="run-suite"]').click();
  await expect(page.locator('[data-od-id="validation-progress"]')).toBeVisible();

  await expect
    .poll(async () =>
      page.locator('[data-od-id="suite-summary"]').getAttribute("data-suite-status")
    )
    .toBe("completed");

  const counts = await summaryNumbers(page);
  expect(counts.running).toBe(0);
  expect(counts.checks).toBe(counts.passing + counts.failing + counts.awaitingCore);

  const traceLinks = page.locator('[data-od-id="analytical-table"] a[data-od-id^="trace-"]');
  await expect(traceLinks.first()).toBeVisible();

  const hashBox = page.locator('[data-od-id="determinism-hashes"]');
  await expect(hashBox).toBeVisible();
  const wraps = await hashBox.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      whiteSpace: style.whiteSpace,
      overflowWrap: style.overflowWrap,
      wraps: node.scrollWidth <= node.clientWidth + 2
    };
  });
  expect(wraps.whiteSpace).toBe("pre-wrap");
  expect(["anywhere", "break-word"]).toContain(wraps.overflowWrap);
  expect(wraps.wraps).toBe(true);

  const pendingRows = page.locator('[data-od-id="pending-table"] tbody tr');
  await expect(pendingRows.first()).toBeVisible();
  const pendingStatus = await page
    .locator('[data-od-id="pending-table"] td[data-column="status"]')
    .allTextContents();
  expect(pendingStatus.every((entry) => /awaiting core/i.test(entry))).toBe(true);
  await expect(
    page.locator('[data-od-id="pending-table"] td[data-column="owner"]').first()
  ).not.toBeEmpty();
  await expect(
    page.locator('[data-od-id="pending-table"] td[data-column="gate"]').first()
  ).not.toBeEmpty();
  await expect(page.locator('[data-od-id="pending-table"]')).not.toContainText(/pass/i);
});

test("every timestep replays the recorded fixture to completion without injected failures", async ({
  page
}) => {
  test.setTimeout(60_000);

  await page.goto("/validation");

  for (const dt of ["0.0020833333333333333", "0.016666666666666666", "0.004166666666666667"]) {
    await page.locator('[data-od-id="timestep-select"]').selectOption(dt);
    await page.locator('[data-od-id="run-suite"]').click();
    await expect
      .poll(async () =>
        page.locator('[data-od-id="suite-summary"]').getAttribute("data-suite-status")
      )
      .toBe("completed");
    await expect(page.locator('[data-od-id="validation-recovery"]')).toHaveCount(0);
  }
});
