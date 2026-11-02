import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (name) =>
  JSON.parse(readFileSync(resolve(root, `docs/architecture/evidence/${name}`), "utf8"));
const physics = read("physics-spike.json");
const interaction = read("browser-offline-spike.json");
writeFileSync(
  resolve(root, "docs/architecture/evidence/benchmark-results.json"),
  `${JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), status: physics.status === "pass" && interaction.status === "pass" ? "pass" : "fail", exactDevice: { source: "local benchmark host", physics: physics.environment ?? null, interaction: interaction.environment ?? null }, physics, interaction }, null, 2)}\n`
);

const automated = interaction.browserEvidence ?? [];
writeFileSync(
  resolve(root, "docs/architecture/evidence/browser-matrix.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      approvalReady: false,
      automated,
      externalRequired: [
        {
          browser: "Safari stable and previous",
          device: "macOS",
          status: "not-executed",
          reason: "Requires real Safari hardware; Playwright WebKit is not Safari."
        },
        {
          browser: "iPadOS Safari",
          device: "iPad",
          status: "not-executed",
          reason: "Requires a real iPadOS device."
        },
        {
          browser: "Android Chrome",
          device: "Android",
          status: "not-executed",
          reason: "Requires a real Android device or approved device lab."
        }
      ]
    },
    null,
    2
  )}\n`
);
console.log("Final benchmark aggregation and honest browser matrix generated.");
