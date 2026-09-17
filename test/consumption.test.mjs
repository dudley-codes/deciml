import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import decimlExtension from "../dist/extension/index.js";

const SOURCE = "export function alpha() {\n  return 1;\n}\n";
const SOURCE_HASH = createHash("sha256").update(SOURCE).digest("hex");
const VALID_DESCRIPTOR = `FILE @F01
PATH src/alpha.ts

FUNCTION @S001 alpha
SOURCE L1-L3
`;

const EMPTY_COLD_ARTIFACT = {
  version: 1,
  mode: "Cold",
  fullFileReads: 0,
  descriptorReads: 0,
  symbolSourceReads: 0,
  canonicalSourceLinesRead: 0,
  canonicalSourceBytesRead: 0,
  descriptorBytesRead: 0,
  descriptorGenerationSourceBytes: 0,
};

async function createIndexedRepository() {
  const root = await mkdtemp(join(tmpdir(), "deciml-consumption-"));
  await mkdir(join(root, ".deciml"));
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "alpha.ts"), SOURCE, "utf8");
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
            sourceHash: SOURCE_HASH,
            shortDescription: "An example module.",
            symbolIds: ["@S001"],
          },
        ],
        symbols: [
          {
            id: "@S001",
            fileId: "@F01",
            name: "alpha",
            kind: "function",
            startLine: 1,
            endLine: 3,
            signature: "alpha()",
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

function loadExtension(mode) {
  const handlers = new Map();
  const registeredFlags = new Map();
  const tools = new Map();
  let activeTools = [];

  decimlExtension({
    registerFlag(name, options) {
      registeredFlags.set(name, options);
    },
    getFlag(name) {
      return name === "deciml-mode" ? mode : undefined;
    },
    registerTool(tool) {
      tools.set(tool.name, tool);
      activeTools.push(tool.name);
    },
    getActiveTools() {
      return [...activeTools];
    },
    setActiveTools(names) {
      activeTools = [...names];
    },
    on(event, handler) {
      handlers.set(event, handler);
    },
  });

  return {
    handlers,
    registeredFlags,
    tools,
    getActiveTools: () => [...activeTools],
  };
}

async function readArtifact(root) {
  return JSON.parse(
    await readFile(join(root, ".deciml", "consumption.json"), "utf8"),
  );
}

test("a benchmark session starts with a fresh human-readable consumption artifact", async () => {
  const root = await mkdtemp(join(tmpdir(), "deciml-consumption-"));
  const { handlers, registeredFlags } = loadExtension("cold");

  assert.deepEqual(registeredFlags.get("deciml-mode"), {
    description: "Benchmark mode: Control, Cold, or Warm",
    type: "string",
  });

  const startSession = handlers.get("session_start");
  assert.equal(typeof startSession, "function");
  await startSession({ reason: "startup" }, { cwd: root });

  const serialized = await readFile(join(root, ".deciml", "consumption.json"), "utf8");
  assert.equal(serialized, `${JSON.stringify(EMPTY_COLD_ARTIFACT, null, 2)}\n`);
});

test("a session rejects a missing or unknown benchmark mode", async () => {
  for (const mode of [undefined, "experiment"]) {
    const root = await mkdtemp(join(tmpdir(), "deciml-consumption-"));
    const { handlers } = loadExtension(mode);

    await assert.rejects(
      handlers.get("session_start")({ reason: "startup" }, { cwd: root }),
      {
        message:
          "Deciml benchmark mode is required. Pass `--deciml-mode Control`, `Cold`, or `Warm`.",
      },
    );
  }
});

test("a cold descriptor miss records one full-file read and generation source", async () => {
  const root = await createIndexedRepository();
  const { handlers, tools } = loadExtension("Cold");
  await handlers.get("session_start")({ reason: "startup" }, { cwd: root });

  const result = await tools.get("deciml_open").execute(
    "open-call",
    { fileId: "@F01" },
    undefined,
    undefined,
    { cwd: root },
  );

  assert.match(result.content[0]?.text ?? "", /CANONICAL SOURCE\nexport function alpha/);
  assert.deepEqual(await readArtifact(root), {
    ...EMPTY_COLD_ARTIFACT,
    fullFileReads: 1,
    canonicalSourceLinesRead: 3,
    canonicalSourceBytesRead: 40,
    descriptorGenerationSourceBytes: 40,
  });
});

test("descriptor hits and symbol source reads record only the material returned", async () => {
  const root = await createIndexedRepository();
  const { handlers, tools } = loadExtension("Warm");
  await handlers.get("session_start")({ reason: "startup" }, { cwd: root });
  await tools.get("deciml_save_descriptor").execute(
    "save-call",
    { fileId: "@F01", descriptor: VALID_DESCRIPTOR },
    undefined,
    undefined,
    { cwd: root },
  );

  const descriptorResult = await tools.get("deciml_open").execute(
    "hit-call",
    { fileId: "@F01" },
    undefined,
    undefined,
    { cwd: root },
  );
  const sourceResult = await tools.get("deciml_source").execute(
    "source-call",
    { symbolId: "@S001" },
    undefined,
    undefined,
    { cwd: root },
  );

  assert.doesNotMatch(descriptorResult.content[0]?.text ?? "", /return 1/);
  assert.match(sourceResult.content[0]?.text ?? "", /return 1/);
  assert.deepEqual(await readArtifact(root), {
    ...EMPTY_COLD_ARTIFACT,
    mode: "Warm",
    descriptorReads: 1,
    symbolSourceReads: 1,
    canonicalSourceLinesRead: 3,
    canonicalSourceBytesRead: 39,
    descriptorBytesRead: 63,
  });
});

test("a warm ordinary full-file read redirects and records one descriptor read", async () => {
  const root = await createIndexedRepository();
  const { handlers, tools } = loadExtension("Warm");
  await handlers.get("session_start")({ reason: "startup" }, { cwd: root });
  await tools.get("deciml_save_descriptor").execute(
    "save-call",
    { fileId: "@F01", descriptor: VALID_DESCRIPTOR },
    undefined,
    undefined,
    { cwd: root },
  );

  const result = await tools.get("read").execute(
    "read-call",
    { path: "src/alpha.ts" },
    undefined,
    undefined,
    { cwd: root },
  );

  assert.match(result.content[0]?.text ?? "", /^HIT @F01/);
  assert.doesNotMatch(result.content[0]?.text ?? "", /return 1/);
  assert.deepEqual(await readArtifact(root), {
    ...EMPTY_COLD_ARTIFACT,
    mode: "Warm",
    descriptorReads: 1,
    descriptorBytesRead: 63,
  });
});

test("ordinary indexed reads record the canonical source actually returned", async () => {
  const root = await createIndexedRepository();
  await writeFile(join(root, "notes.txt"), "not indexed\n", "utf8");
  const { handlers, tools } = loadExtension("Cold");
  const startSession = handlers.get("session_start");
  await startSession({ reason: "startup" }, { cwd: root });

  const fullResult = await tools.get("read").execute(
    "full-read",
    { path: "src/alpha.ts" },
    undefined,
    undefined,
    { cwd: root },
  );
  assert.equal(fullResult.content[0]?.text, SOURCE);
  assert.deepEqual(await readArtifact(root), {
    ...EMPTY_COLD_ARTIFACT,
    fullFileReads: 1,
    canonicalSourceLinesRead: 3,
    canonicalSourceBytesRead: 40,
  });

  await startSession({ reason: "new" }, { cwd: root });
  const partialResult = await tools.get("read").execute(
    "partial-read",
    { path: "src/alpha.ts", offset: 2, limit: 1 },
    undefined,
    undefined,
    { cwd: root },
  );
  await tools.get("read").execute(
    "non-indexed-read",
    { path: "notes.txt" },
    undefined,
    undefined,
    { cwd: root },
  );

  assert.match(partialResult.content[0]?.text ?? "", /^  return 1;/);
  assert.deepEqual(await readArtifact(root), {
    ...EMPTY_COLD_ARTIFACT,
    canonicalSourceLinesRead: 1,
    canonicalSourceBytesRead: 11,
  });
});

test("reloading the extension preserves the current session artifact", async () => {
  const root = await createIndexedRepository();
  const { handlers, tools } = loadExtension("Cold");
  const startSession = handlers.get("session_start");
  await startSession({ reason: "startup" }, { cwd: root });
  await tools.get("deciml_source").execute(
    "source-call",
    { symbolId: "@S001" },
    undefined,
    undefined,
    { cwd: root },
  );

  await startSession({ reason: "reload" }, { cwd: root });

  assert.deepEqual(await readArtifact(root), {
    ...EMPTY_COLD_ARTIFACT,
    symbolSourceReads: 1,
    canonicalSourceLinesRead: 3,
    canonicalSourceBytesRead: 39,
  });
});

test("parallel qualifying operations each update the artifact exactly once", async () => {
  const root = await createIndexedRepository();
  const { handlers, tools } = loadExtension("Warm");
  await handlers.get("session_start")({ reason: "startup" }, { cwd: root });

  await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      tools.get("deciml_source").execute(
        `source-${index}`,
        { symbolId: "@S001" },
        undefined,
        undefined,
        { cwd: root },
      ),
    ),
  );

  assert.deepEqual(await readArtifact(root), {
    ...EMPTY_COLD_ARTIFACT,
    mode: "Warm",
    symbolSourceReads: 8,
    canonicalSourceLinesRead: 24,
    canonicalSourceBytesRead: 312,
  });
});

test("Control mode measures normal reads without exposing Deciml navigation", async () => {
  const root = await createIndexedRepository();
  const extension = loadExtension("Control");
  await extension.tools.get("deciml_save_descriptor").execute(
    "save-call",
    { fileId: "@F01", descriptor: VALID_DESCRIPTOR },
    undefined,
    undefined,
    { cwd: root },
  );
  await extension.handlers.get("session_start")(
    { reason: "startup" },
    { cwd: root },
  );

  const result = await extension.tools.get("read").execute(
    "control-read",
    { path: "src/alpha.ts" },
    undefined,
    undefined,
    { cwd: root },
  );
  const resources = await extension.handlers.get("resources_discover")(
    { cwd: root, reason: "startup" },
    {},
  );

  assert.equal(result.content[0]?.text, SOURCE);
  assert.deepEqual(
    extension.getActiveTools().filter((name) => name.startsWith("deciml_")),
    [],
  );
  assert.deepEqual(resources.skillPaths, []);
  assert.deepEqual(await readArtifact(root), {
    ...EMPTY_COLD_ARTIFACT,
    mode: "Control",
    fullFileReads: 1,
    canonicalSourceLinesRead: 3,
    canonicalSourceBytesRead: 40,
  });
});
