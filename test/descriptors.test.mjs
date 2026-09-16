import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { decimlOpen, decimlSaveDescriptor } from "../dist/extension/index.js";

const SOURCE_HASH = "2f2d8ab6453896290e40a007f1df961cc6004062c86a0a1e6480e8ce201a58aa";
const CHANGED_SOURCE_HASH = "4df6bf0edce4f397af3aa05aec8111e8a517d39f1a5e8d12ddd0a08861b5f107";

async function createIndexedRepository() {
  const root = await mkdtemp(join(tmpdir(), "deciml-descriptors-"));
  await mkdir(join(root, ".deciml"));
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "alpha.ts"), "export const alpha = 1;\n", "utf8");
  await writeFile(join(root, "src", "beta.ts"), "export const beta = 2;\n", "utf8");
  await writeFile(
    join(root, ".deciml", "index.json"),
    `${JSON.stringify(
      {
        version: 1,
        benchmark: {
          repository: "example/repository",
          commit: "abc123",
          taskPrompt: "Example task",
          candidatePaths: ["src/alpha.ts", "src/beta.ts"],
        },
        files: [
          {
            id: "@F01",
            path: "src/alpha.ts",
            sourceHash: SOURCE_HASH,
            shortDescription: "An example module.",
            symbolIds: ["@S001"],
          },
          {
            id: "@F02",
            path: "src/beta.ts",
            sourceHash: "unused-in-this-test",
            shortDescription: "Another example module.",
            symbolIds: ["@S002"],
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
          {
            id: "@S002",
            fileId: "@F02",
            name: "beta",
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
  return root;
}

test("deciml_open reports a descriptor miss with deterministic identity and complete source", async () => {
  const root = await createIndexedRepository();

  const result = await decimlOpen.execute(
    "call-1",
    { fileId: "@F01" },
    undefined,
    undefined,
    { cwd: root },
  );

  assert.deepEqual(result.details, {
    status: "MISS",
    fileId: "@F01",
    path: "src/alpha.ts",
    sourceHash: SOURCE_HASH,
  });
  assert.equal(
    result.content[0]?.text,
    `MISS @F01
PATH src/alpha.ts
SOURCE_HASH ${SOURCE_HASH}

INDEXED SYMBOLS
VARIABLE @S001 alpha
SOURCE L1-L1

DESCRIPTOR INSTRUCTIONS
Produce task-independent semantic pseudo-code describing this file itself, not the current task.
Begin with exactly:
FILE @F01
PATH src/alpha.ts
For each described symbol, copy its indexed @S reference and name above, then place its exact SOURCE range on the following line.
Use @S references only in symbol section headers. Do not invent or copy file or symbol identity.
Save the complete descriptor with deciml_save_descriptor for @F01.

CANONICAL SOURCE
export const alpha = 1;
`,
  );
});

const VALID_DESCRIPTOR = `FILE @F01
PATH src/alpha.ts

ROLE
  Expose the alpha value.

VARIABLE @S001 alpha
SOURCE L1-L1

BEHAVIOR
  EXPORT constant alpha with value 1
`;

test("deciml_save_descriptor persists validated identity and makes the descriptor a fresh hit", async () => {
  const root = await createIndexedRepository();

  const saved = await decimlSaveDescriptor.execute(
    "call-2",
    { fileId: "@F01", descriptor: VALID_DESCRIPTOR },
    undefined,
    undefined,
    { cwd: root },
  );

  assert.equal(saved.content[0]?.text, "Saved descriptor for @F01 (src/alpha.ts).");
  assert.deepEqual(saved.details, {
    fileId: "@F01",
    path: "src/alpha.ts",
    sourceHash: SOURCE_HASH,
    descriptorSourceHash: SOURCE_HASH,
  });
  assert.deepEqual(
    JSON.parse(await readFile(join(root, ".deciml", "descriptors.json"), "utf8")),
    {
      version: 1,
      descriptors: [
        {
          fileId: "@F01",
          path: "src/alpha.ts",
          sourceHash: SOURCE_HASH,
          descriptorSourceHash: SOURCE_HASH,
          descriptor: VALID_DESCRIPTOR,
        },
      ],
    },
  );

  const opened = await decimlOpen.execute(
    "call-3",
    { fileId: "@F01" },
    undefined,
    undefined,
    { cwd: root },
  );

  assert.deepEqual(opened.details, {
    status: "HIT",
    fileId: "@F01",
    path: "src/alpha.ts",
    sourceHash: SOURCE_HASH,
  });
  assert.equal(opened.content[0]?.text, `HIT @F01\nPATH src/alpha.ts\n\n${VALID_DESCRIPTOR}`);
});

test("deciml_save_descriptor rejects a symbol owned by another file without persisting", async () => {
  const root = await createIndexedRepository();
  const descriptor = `FILE @F01
PATH src/alpha.ts

VARIABLE @S002 beta
SOURCE L1-L1
`;

  await assert.rejects(
    decimlSaveDescriptor.execute(
      "call-4",
      { fileId: "@F01", descriptor },
      undefined,
      undefined,
      { cwd: root },
    ),
    { message: "Symbol @S002 is not owned by file @F01." },
  );
  await assert.rejects(access(join(root, ".deciml", "descriptors.json")), {
    code: "ENOENT",
  });
});

test("deciml_save_descriptor rejects an unknown symbol without altering existing descriptors", async () => {
  const root = await createIndexedRepository();
  await decimlSaveDescriptor.execute(
    "call-5",
    { fileId: "@F01", descriptor: VALID_DESCRIPTOR },
    undefined,
    undefined,
    { cwd: root },
  );
  const descriptorStorePath = join(root, ".deciml", "descriptors.json");
  const before = await readFile(descriptorStorePath, "utf8");
  const descriptor = `FILE @F01
PATH src/alpha.ts

VARIABLE @S999 invented
SOURCE L1-L1
`;

  await assert.rejects(
    decimlSaveDescriptor.execute(
      "call-6",
      { fileId: "@F01", descriptor },
      undefined,
      undefined,
      { cwd: root },
    ),
    { message: "Unknown symbol reference @S999 for file @F01." },
  );
  assert.equal(await readFile(descriptorStorePath, "utf8"), before);
});

test("deciml_open treats a source change as a descriptor miss and returns current canonical source", async () => {
  const root = await createIndexedRepository();
  await decimlSaveDescriptor.execute(
    "call-7",
    { fileId: "@F01", descriptor: VALID_DESCRIPTOR },
    undefined,
    undefined,
    { cwd: root },
  );
  await writeFile(join(root, "src", "alpha.ts"), "export const alpha = 2;\n", "utf8");

  const opened = await decimlOpen.execute(
    "call-8",
    { fileId: "@F01" },
    undefined,
    undefined,
    { cwd: root },
  );

  assert.deepEqual(opened.details, {
    status: "MISS",
    fileId: "@F01",
    path: "src/alpha.ts",
    sourceHash: CHANGED_SOURCE_HASH,
  });
  assert.match(opened.content[0]?.text ?? "", /^MISS @F01\n/);
  assert.match(
    opened.content[0]?.text ?? "",
    /CANONICAL SOURCE\nexport const alpha = 2;\n$/,
  );
  assert.doesNotMatch(opened.content[0]?.text ?? "", /Expose the alpha value/);
});

test("deciml_open rejects an unknown file reference", async () => {
  const root = await createIndexedRepository();

  await assert.rejects(
    decimlOpen.execute(
      "call-9",
      { fileId: "@F99" },
      undefined,
      undefined,
      { cwd: root },
    ),
    { message: "Unknown Deciml file reference: @F99." },
  );
});

for (const invalid of [
  {
    name: "mismatched file identity",
    descriptor: VALID_DESCRIPTOR.replace("FILE @F01", "FILE @F02"),
    message: "Descriptor must begin with exactly `FILE @F01`.",
  },
  {
    name: "mismatched path identity",
    descriptor: VALID_DESCRIPTOR.replace("PATH src/alpha.ts", "PATH src/beta.ts"),
    message: "Descriptor must identify the indexed path as `PATH src/alpha.ts`.",
  },
  {
    name: "malformed symbol reference",
    descriptor: `${VALID_DESCRIPTOR}\nRELATION @S_999\n`,
    message: "Malformed symbol reference @S_999.",
  },
  {
    name: "embedded symbol reference",
    descriptor: `${VALID_DESCRIPTOR}\nRELATION x@S001 alpha\n`,
    message: "Malformed symbol reference @S001.",
  },
  {
    name: "invented symbol name",
    descriptor: VALID_DESCRIPTOR.replace("@S001 alpha", "@S001 renamedAlpha"),
    message: "Symbol @S001 must use its indexed name: alpha.",
  },
  {
    name: "non-indexed source range",
    descriptor: VALID_DESCRIPTOR.replace("SOURCE L1-L1", "SOURCE L1-L2"),
    message: "Symbol @S001 must be followed by its indexed range: SOURCE L1-L1.",
  },
  {
    name: "malformed extra source range",
    descriptor: `${VALID_DESCRIPTOR}\n SOURCE L9-L9 \n`,
    message: "Malformed source range:  SOURCE L9-L9 ",
  },
  {
    name: "tab-delimited source range",
    descriptor: `${VALID_DESCRIPTOR}\nSOURCE\tL9-L9\n`,
    message: "Malformed source range: SOURCE\tL9-L9",
  },
  {
    name: "colon-delimited source range",
    descriptor: `${VALID_DESCRIPTOR}\nSOURCE:L9-L9\n`,
    message: "Malformed source range: SOURCE:L9-L9",
  },
]) {
  test(`deciml_save_descriptor rejects ${invalid.name}`, async () => {
    const root = await createIndexedRepository();

    await assert.rejects(
      decimlSaveDescriptor.execute(
        "call-10",
        { fileId: "@F01", descriptor: invalid.descriptor },
        undefined,
        undefined,
        { cwd: root },
      ),
      { message: invalid.message },
    );
    await assert.rejects(access(join(root, ".deciml", "descriptors.json")), {
      code: "ENOENT",
    });
  });
}
