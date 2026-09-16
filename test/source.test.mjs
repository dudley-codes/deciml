import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { decimlSource } from "../dist/extension/index.js";

const CURRENT_SOURCE =
  'const before = "not returned";\r\n' +
  "export function alpha() {\r\n" +
  '  return "current";\r\n' +
  "}\r\n" +
  'const after = "not returned";\r\n';

async function createIndexedRepository() {
  const root = await mkdtemp(join(tmpdir(), "deciml-source-"));
  await mkdir(join(root, ".deciml"));
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "example.ts"), CURRENT_SOURCE, "utf8");
  await writeFile(
    join(root, ".deciml", "index.json"),
    `${JSON.stringify(
      {
        version: 1,
        benchmark: {
          repository: "example/repository",
          commit: "abc123",
          taskPrompt: "Example task",
          candidatePaths: ["src/example.ts"],
        },
        files: [
          {
            id: "@F01",
            path: "src/example.ts",
            sourceHash: "hash-from-indexing-time",
            shortDescription: "An example module.",
            symbolIds: ["@S001", "@S002", "@S003"],
          },
        ],
        symbols: [
          {
            id: "@S001",
            fileId: "@F01",
            name: "before",
            kind: "variable",
            startLine: 1,
            endLine: 1,
          },
          {
            id: "@S002",
            fileId: "@F01",
            name: "alpha",
            kind: "function",
            startLine: 2,
            endLine: 4,
            signature: "alpha()",
          },
          {
            id: "@S003",
            fileId: "@F01",
            name: "after",
            kind: "variable",
            startLine: 5,
            endLine: 5,
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    join(root, ".deciml", "descriptors.json"),
    `${JSON.stringify({
      version: 1,
      descriptors: [
        {
          fileId: "@F01",
          path: "src/example.ts",
          sourceHash: "hash-from-indexing-time",
          descriptorSourceHash: "hash-from-indexing-time",
          descriptor: "DESCRIPTOR TEXT MUST NOT BE RETURNED",
        },
      ],
    })}\n`,
    "utf8",
  );
  return root;
}

test("deciml_source returns only the indexed symbol's exact current source", async () => {
  const root = await createIndexedRepository();

  const result = await decimlSource.execute(
    "call-1",
    { symbolId: "@S002" },
    undefined,
    undefined,
    { cwd: root },
  );

  assert.deepEqual(result.details, {
    fileId: "@F01",
    path: "src/example.ts",
    symbolId: "@S002",
    symbolName: "alpha",
    startLine: 2,
    endLine: 4,
  });
  assert.equal(
    result.content[0]?.text,
    "FILE @F01\n" +
      "PATH src/example.ts\n" +
      "SYMBOL @S002 alpha\n" +
      "SOURCE L2-L4\n\n" +
      "export function alpha() {\r\n" +
      '  return "current";\r\n' +
      "}",
  );
  assert.doesNotMatch(result.content[0]?.text ?? "", /not returned|DESCRIPTOR TEXT/);
});

test("deciml_source rejects an unknown symbol without returning unrelated source", async () => {
  const root = await createIndexedRepository();

  await assert.rejects(
    decimlSource.execute(
      "call-2",
      { symbolId: "@S999" },
      undefined,
      undefined,
      { cwd: root },
    ),
    { message: "Unknown Deciml symbol reference: @S999." },
  );
});

test("deciml_source rejects an indexed range outside the current file", async () => {
  const root = await createIndexedRepository();
  await writeFile(join(root, "src", "example.ts"), "export const shortened = true;\n", "utf8");

  await assert.rejects(
    decimlSource.execute(
      "call-3",
      { symbolId: "@S002" },
      undefined,
      undefined,
      { cwd: root },
    ),
    {
      message:
        "Indexed range L2-L4 for symbol @S002 is outside the current file src/example.ts.",
    },
  );
});
