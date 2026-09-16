#!/usr/bin/env node

import { indexBenchmark } from "./index/index-benchmark.js";

const usage = "Usage: deciml index [repository-root]";

async function main(): Promise<void> {
  const [command, repositoryRoot, ...extraArguments] = process.argv.slice(2);

  if (command === "--help" || command === "-h") {
    console.log(usage);
    return;
  }

  if (command !== "index" || extraArguments.length > 0) {
    throw new Error(usage);
  }

  const result = await indexBenchmark(repositoryRoot ?? process.cwd());
  console.log(
    `Indexed ${result.fileCount} files and ${result.symbolCount} symbols.\n` +
      `Index: ${result.indexPath}\n` +
      `Project: ${result.projectPath}`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`deciml: ${message}`);
  process.exitCode = 1;
});
