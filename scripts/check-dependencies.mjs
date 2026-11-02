import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

const root = resolve(import.meta.dirname, "..");
const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
const packages = Object.entries(lock.packages)
  .filter(([path, value]) => path.startsWith("node_modules/") && !value.link)
  .map(([path, value]) => ({
    type: "library",
    name: path.replace(/^node_modules\//, ""),
    version: value.version,
    licenses: [{ license: { id: value.license ?? "UNKNOWN" } }],
    hashes: value.integrity ? [{ alg: "SRI", content: value.integrity }] : []
  }));

const missingIntegrity = packages.filter((item) => item.hashes.length === 0);
const missingLicense = packages.filter((item) => item.licenses[0].license.id === "UNKNOWN");
if (lock.lockfileVersion !== 3)
  throw new Error(`Expected npm lockfile v3, received ${lock.lockfileVersion}`);
if (missingIntegrity.length > 0)
  throw new Error(
    `Dependencies without lock integrity: ${missingIntegrity.map((item) => item.name).join(", ")}`
  );
if (missingLicense.length > 0)
  throw new Error(
    `Dependencies without declared licenses: ${missingLicense.map((item) => item.name).join(", ")}`
  );

let audit = { status: "not-requested", vulnerabilities: {} };
if (process.argv.includes("--audit")) {
  try {
    const output = execFileSync("npm", ["audit", "--json", "--audit-level=high"], {
      cwd: root,
      encoding: "utf8",
      shell: process.platform === "win32"
    });
    audit = { status: "pass", vulnerabilities: JSON.parse(output).metadata?.vulnerabilities ?? {} };
  } catch (error) {
    const report = error.stdout ? JSON.parse(String(error.stdout)) : null;
    const high =
      (report?.metadata?.vulnerabilities?.high ?? 0) +
      (report?.metadata?.vulnerabilities?.critical ?? 0);
    if (high > 0) throw new Error(`npm audit found ${high} high/critical vulnerabilities`);
    throw error;
  }
}

const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  serialNumber: `urn:uuid:${randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    component: { type: "application", name: lock.name, version: lock.version }
  },
  components: packages
};
writeFileSync(
  resolve(root, "docs/architecture/evidence/sbom.cdx.json"),
  `${JSON.stringify(sbom, null, 2)}\n`
);
writeFileSync(
  resolve(root, "docs/architecture/evidence/dependency-check.json"),
  `${JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), status: "pass", lockfileVersion: lock.lockfileVersion, packageCount: packages.length, licenseCheck: "pass", integrityCheck: "pass", audit }, null, 2)}\n`
);
console.log(`Dependency checks passed for ${packages.length} locked packages.`);
