import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadSkills } from "@earendil-works/pi-coding-agent";
import decimlExtension, { decimlRead } from "../dist/extension/index.js";

const SOURCE = 'export const alpha = "CANONICAL SOURCE";\n';
const VALID_DESCRIPTOR = `FILE @F01
PATH src/alpha.ts

ROLE
  Expose alpha.

VARIABLE @S001 alpha
SOURCE L1-L1

BEHAVIOR
  EXPORT alpha
`;

function hashSource(sourceText) {
  return createHash("sha256").update(sourceText).digest("hex");
}

async function createIndexedRepository({ descriptor = "fresh" } = {}) {
  const root = await mkdtemp(join(tmpdir(), "deciml-warm-navigation-"));
  const sourceHash = hashSource(SOURCE);
  await mkdir(join(root, ".deciml"));
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "alpha.ts"), SOURCE, "utf8");
  await writeFile(
    join(root, "notes.txt"),
    "This non-indexed file must use normal read behavior.\n",
    "utf8",
  );
  await writeFile(
    join(root, ".deciml", "index.json"),
    `${JSON.stringify(
      {
        version: 1,
        benchmark: {
          repository: "example/repository",
          commit: "abc123",
          taskPrompt: "Example task",
          candidatePaths: ["src/alpha.ts"],
        },
        files: [
          {
            id: "@F01",
            path: "src/alpha.ts",
            sourceHash,
            shortDescription: "An example module.",
            symbolIds: ["@S001"],
          },
        ],
        symbols: [
          {
            id: "@S001",
            fileId: "@F01",
            name: "alpha",
            kind: "variable",
            startLine: 1,
            endLine: 1,
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  if (descriptor !== "missing") {
    const descriptorHash = descriptor === "fresh" ? sourceHash : "stale-source-hash";
    await writeFile(
      join(root, ".deciml", "descriptors.json"),
      `${JSON.stringify(
        {
          version: 1,
          descriptors: [
            {
              fileId: "@F01",
              path: "src/alpha.ts",
              sourceHash: descriptorHash,
              descriptorSourceHash: descriptorHash,
              descriptor: VALID_DESCRIPTOR,
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  return root;
}

async function executeRead(root, params) {
  return decimlRead.execute(
    "read-call",
    params,
    undefined,
    undefined,
    { cwd: root },
  );
}

test("a full read of a warm indexed file returns its descriptor instead of source", async () => {
  const root = await createIndexedRepository();

  const result = await executeRead(root, { path: "src/alpha.ts" });

  assert.equal(
    result.content[0]?.text,
    `HIT @F01
PATH src/alpha.ts

${VALID_DESCRIPTOR}
Use deciml_source @Sxx for canonical implementation source.`,
  );
  assert.equal(result.details, undefined);
  assert.doesNotMatch(result.content[0]?.text ?? "", /CANONICAL SOURCE/);
});

test("full reads with missing or stale descriptors use normal current source", async () => {
  for (const descriptor of ["missing", "stale"]) {
    const root = await createIndexedRepository({ descriptor });

    const result = await executeRead(root, { path: "src/alpha.ts" });

    assert.equal(result.content[0]?.text, SOURCE);
    assert.doesNotMatch(result.content[0]?.text ?? "", /ROLE|deciml_source/);
  }
});

test("non-indexed and partial reads retain built-in read behavior", async () => {
  const root = await createIndexedRepository();

  const nonIndexed = await executeRead(root, { path: "notes.txt" });
  assert.equal(
    nonIndexed.content[0]?.text,
    "This non-indexed file must use normal read behavior.\n",
  );

  const partial = await executeRead(root, {
    path: "src/alpha.ts",
    offset: 1,
    limit: 1,
  });
  assert.match(partial.content[0]?.text ?? "", /CANONICAL SOURCE/);
  assert.doesNotMatch(partial.content[0]?.text ?? "", /ROLE|deciml_source/);
});

test("the extension discovers a valid Deciml workflow skill", async () => {
  let discoverResources;
  const registeredTools = [];
  decimlExtension({
    registerFlag() {},
    registerTool(tool) {
      registeredTools.push(tool.name);
    },
    on(event, handler) {
      if (event === "resources_discover") discoverResources = handler;
    },
  });

  assert.ok(registeredTools.includes("read"));
  assert.equal(typeof discoverResources, "function");
  const resources = await discoverResources(
    { cwd: process.cwd(), reason: "startup" },
    {},
  );
  const loaded = loadSkills({
    cwd: process.cwd(),
    agentDir: process.cwd(),
    skillPaths: resources.skillPaths,
    includeDefaults: false,
  });

  assert.deepEqual(loaded.diagnostics, []);
  assert.deepEqual(loaded.skills.map((skill) => skill.name), ["deciml"]);

  const skillText = await readFile(loaded.skills[0].filePath, "utf8");
  const steps = [
    "deciml_project",
    "deciml_open",
    "deciml_source",
    "normal repository files",
  ];
  let previousOffset = -1;
  for (const step of steps) {
    const offset = skillText.indexOf(step);
    assert.ok(offset > previousOffset, `${step} must appear in workflow order`);
    previousOffset = offset;
  }
  assert.match(skillText, /Never implement from a semantic descriptor alone\./);
  assert.doesNotMatch(skillText, /tokens?|minimi[sz]/i);
});
