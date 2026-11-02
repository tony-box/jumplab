import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { spikeControlContracts } from "../../packages/schema/src/index";

const root = resolve(import.meta.dirname, "../..");
const behaviorSheets = [
  "index.html",
  "workbench.html",
  "designer.html",
  "run-report.html",
  "scenario-library.html",
  "validation.html"
];
const renderedReferences = [
  "workbench.html",
  "designer.html",
  "run-report.html",
  "scenario-library.html",
  "validation.html"
];

describe("wireframe and input inventory", () => {
  it("keeps normative sheet ids and rendered regions discoverable", () => {
    for (const file of behaviorSheets) {
      const sheet = readFileSync(resolve(root, "ui_wireframes", file), "utf8");
      expect(sheet).toMatch(/<code>[^<]+<\/code>/);
    }
    for (const file of renderedReferences) {
      const rendered = readFileSync(resolve(root, "ui_wireframes/rendered_html", file), "utf8");
      expect(rendered).toMatch(/<body[ >]/);
    }
  });

  it("requires complete metadata for every editable spike input", () => {
    expect(spikeControlContracts.length).toBeGreaterThan(10);
    for (const control of spikeControlContracts) {
      expect(control.id).toBeTruthy();
      expect(control.unit).toBeTruthy();
      expect(control.maximum).toBeGreaterThan(control.minimum);
      expect(control.explanation).toBeTruthy();
    }
  });

  it("prohibits application imports from prototype HTML or scripts", () => {
    const applicationFiles = ["apps/web/src/App.tsx", "apps/web/src/main.tsx"];
    for (const file of applicationFiles) {
      const source = readFileSync(resolve(root, file), "utf8");
      expect(source).not.toMatch(/ui_wireframes|rendered_html|prototype/i);
    }
  });
});
