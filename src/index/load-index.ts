import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { DecimlIndex } from "./types.js";

const INDEX_PATH = join(".deciml", "index.json");

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : undefined;
}

export async function loadIndex(repositoryRoot: string): Promise<DecimlIndex> {
  try {
    return JSON.parse(
      await readFile(join(repositoryRoot, INDEX_PATH), "utf8"),
    ) as DecimlIndex;
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") {
      throw new Error(
        "No Deciml index exists for this repository. Run `deciml index` first.",
      );
    }
    throw error;
  }
}
