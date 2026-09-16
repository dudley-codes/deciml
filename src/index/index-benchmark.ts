import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { benchmark } from "../benchmark.js";
import { extractSymbols } from "./extract-symbols.js";
import type {
  DecimlIndex,
  FileRecord,
  IndexResult,
  SymbolRecord,
} from "./types.js";

const DECIML_DIRECTORY = ".deciml";
const INDEX_FILE = "index.json";
const PROJECT_FILE = "project.md";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function git(
  repositoryRoot: string,
  arguments_: string[],
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("git", ["-C", repositoryRoot, ...arguments_], {
    encoding: "utf8",
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function assertFrozenBenchmark(repositoryRoot: string, candidatePaths: string[]): void {
  const revision = git(repositoryRoot, ["rev-parse", "HEAD"]);
  if (revision.status !== 0) {
    throw new Error(
      `Cannot read the benchmark Git revision: ${revision.stderr.trim() || "git rev-parse failed"}`,
    );
  }

  const actualCommit = revision.stdout.trim();
  if (actualCommit !== benchmark.commit) {
    throw new Error(
      `Benchmark commit mismatch. Expected ${benchmark.commit}, received ${actualCommit}.`,
    );
  }

  const diff = git(repositoryRoot, [
    "diff",
    "--quiet",
    benchmark.commit,
    "--",
    ...candidatePaths,
  ]);
  if (diff.status === 1) {
    throw new Error(
      "Benchmark candidate files differ from the pinned commit. Use a clean checkout before indexing.",
    );
  }
  if (diff.status !== 0) {
    throw new Error(
      `Cannot verify benchmark files: ${diff.stderr.trim() || "git diff failed"}`,
    );
  }
}

function renderProjectIndex(index: DecimlIndex): string {
  const lines = [
    "PROJECT",
    `BENCHMARK ${index.benchmark.repository}`,
    `COMMIT ${index.benchmark.commit}`,
    "",
  ];

  for (const file of index.files) {
    lines.push(
      `${file.id} ${basename(file.path)}`,
      `  PATH ${file.path}`,
      `  ${file.shortDescription}`,
      "",
    );
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function formatFileReference(index: number): string {
  return `@F${String(index).padStart(2, "0")}`;
}

function formatSymbolReference(index: number): string {
  return `@S${String(index).padStart(3, "0")}`;
}

export async function indexBenchmark(repositoryRoot: string): Promise<IndexResult> {
  const absoluteRoot = resolve(repositoryRoot);
  const candidates = [...benchmark.candidates].sort((left, right) =>
    compareText(left.path, right.path),
  );
  const candidatePaths = candidates.map((candidate) => candidate.path);

  assertFrozenBenchmark(absoluteRoot, candidatePaths);

  const files: FileRecord[] = [];
  const symbols: SymbolRecord[] = [];
  let nextSymbol = 1;

  for (const [fileIndex, candidate] of candidates.entries()) {
    const absolutePath = join(absoluteRoot, candidate.path);
    let sourceText: string;

    try {
      sourceText = await readFile(absolutePath, "utf8");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Cannot read benchmark candidate ${candidate.path}: ${message}`);
    }

    const fileId = formatFileReference(fileIndex + 1);
    const extractedSymbols = extractSymbols(candidate.path, sourceText);
    const symbolIds: string[] = [];

    for (const extracted of extractedSymbols) {
      const symbolId = formatSymbolReference(nextSymbol);
      nextSymbol += 1;
      symbolIds.push(symbolId);
      symbols.push({
        id: symbolId,
        fileId,
        name: extracted.name,
        kind: extracted.kind,
        startLine: extracted.startLine,
        endLine: extracted.endLine,
        ...(extracted.signature ? { signature: extracted.signature } : {}),
      });
    }

    files.push({
      id: fileId,
      path: candidate.path,
      sourceHash: createHash("sha256").update(sourceText).digest("hex"),
      shortDescription: candidate.shortDescription,
      symbolIds,
    });
  }

  const index: DecimlIndex = {
    version: 1,
    benchmark: {
      repository: benchmark.repository,
      commit: benchmark.commit,
      taskPrompt: benchmark.taskPrompt,
      candidatePaths,
    },
    files,
    symbols,
  };
  const outputDirectory = join(absoluteRoot, DECIML_DIRECTORY);
  const indexPath = join(outputDirectory, INDEX_FILE);
  const projectPath = join(outputDirectory, PROJECT_FILE);
  const serializedIndex = `${JSON.stringify(index, null, 2)}\n`;
  const projectIndex = renderProjectIndex(index);

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(indexPath, serializedIndex, "utf8");
  await writeFile(projectPath, projectIndex, "utf8");

  return {
    repositoryRoot: absoluteRoot,
    indexPath,
    projectPath,
    fileCount: files.length,
    symbolCount: symbols.length,
  };
}
