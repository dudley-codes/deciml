import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";

import type {
  DecimlIndex,
  DescriptorRecord,
  DescriptorStore,
  FileRecord,
  SymbolRecord,
} from "../index/types.js";

const INDEX_PATH = join(".deciml", "index.json");
const DESCRIPTORS_PATH = join(".deciml", "descriptors.json");

export interface IndexedFile {
  file: FileRecord;
  sourceHash: string;
  sourceText: string;
  symbols: SymbolRecord[];
  descriptor?: DescriptorRecord;
}

interface IndexedFileState extends Omit<IndexedFile, "descriptor"> {
  indexSymbols: SymbolRecord[];
}

function hashSource(sourceText: string): string {
  return createHash("sha256").update(sourceText).digest("hex");
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : undefined;
}

async function loadIndex(repositoryRoot: string): Promise<DecimlIndex> {
  const indexPath = join(repositoryRoot, INDEX_PATH);

  try {
    return JSON.parse(await readFile(indexPath, "utf8")) as DecimlIndex;
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") {
      throw new Error(
        "No Deciml index exists for this repository. Run `deciml index` first.",
      );
    }
    throw error;
  }
}

async function loadDescriptorStore(repositoryRoot: string): Promise<DescriptorStore> {
  try {
    return JSON.parse(
      await readFile(join(repositoryRoot, DESCRIPTORS_PATH), "utf8"),
    ) as DescriptorStore;
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") {
      return { version: 1, descriptors: [] };
    }
    throw error;
  }
}

async function readIndexedFile(
  repositoryRoot: string,
  fileId: string,
): Promise<IndexedFileState> {
  const index = await loadIndex(repositoryRoot);
  const file = index.files.find((candidate) => candidate.id === fileId);

  if (!file) {
    throw new Error(`Unknown Deciml file reference: ${fileId}.`);
  }

  const sourceText = await readFile(join(repositoryRoot, file.path), "utf8");
  const symbolsById = new Map(index.symbols.map((symbol) => [symbol.id, symbol]));
  const symbols = file.symbolIds.map((symbolId) => {
    const symbol = symbolsById.get(symbolId);
    if (!symbol) {
      throw new Error(`Index file ${file.id} references unknown symbol ${symbolId}.`);
    }
    return symbol;
  });

  return {
    file,
    sourceHash: hashSource(sourceText),
    sourceText,
    symbols,
    indexSymbols: index.symbols,
  };
}

export async function openIndexedFile(
  repositoryRoot: string,
  fileId: string,
): Promise<IndexedFile> {
  const { indexSymbols: _indexSymbols, ...indexedFile } = await readIndexedFile(
    repositoryRoot,
    fileId,
  );
  const store = await loadDescriptorStore(repositoryRoot);
  const descriptor = store.descriptors.find((record) => record.fileId === fileId);
  const descriptorIsFresh =
    descriptor?.path === indexedFile.file.path &&
    descriptor.sourceHash === indexedFile.sourceHash &&
    descriptor.descriptorSourceHash === indexedFile.sourceHash;

  return {
    ...indexedFile,
    ...(descriptor && descriptorIsFresh ? { descriptor } : {}),
  };
}

function validateDescriptor(
  descriptor: string,
  file: FileRecord,
  indexSymbols: SymbolRecord[],
): void {
  const lines = descriptor.split(/\r?\n/);

  if (lines[0] !== `FILE ${file.id}`) {
    throw new Error(`Descriptor must begin with exactly \`FILE ${file.id}\`.`);
  }
  if (lines[1] !== `PATH ${file.path}`) {
    throw new Error(`Descriptor must identify the indexed path as \`PATH ${file.path}\`.`);
  }

  const fileReferences = descriptor.match(/@F[A-Za-z0-9]+/g) ?? [];
  const invalidFileReference = fileReferences.find((reference) => reference !== file.id);
  if (invalidFileReference) {
    throw new Error(
      `Descriptor for ${file.id} cannot reference file ${invalidFileReference}.`,
    );
  }

  let referenceOffset = descriptor.indexOf("@S");
  while (referenceOffset !== -1) {
    const reference = descriptor.slice(referenceOffset).match(/^@S\S*/)?.[0] ?? "@S";
    const precedingCharacter = descriptor[referenceOffset - 1];
    if (
      (precedingCharacter !== undefined && !/\s/.test(precedingCharacter)) ||
      !/^@S\d{3}$/.test(reference)
    ) {
      throw new Error(`Malformed symbol reference ${reference}.`);
    }
    referenceOffset = descriptor.indexOf("@S", referenceOffset + 2);
  }

  const symbolsById = new Map(indexSymbols.map((symbol) => [symbol.id, symbol]));
  const seenSymbols = new Set<string>();
  let sourceRangeCount = 0;

  for (const [lineIndex, line] of lines.entries()) {
    if (line.includes("SOURCE")) {
      if (!/^SOURCE L\d+-L\d+$/.test(line)) {
        throw new Error(`Malformed source range: ${line}`);
      }
      sourceRangeCount += 1;
    }

    const references = line.match(/@S\d{3}/g) ?? [];
    if (references.length === 0) continue;
    if (references.length > 1) {
      throw new Error("Each descriptor symbol section must identify exactly one @S reference.");
    }

    const symbolId = references[0];
    if (!symbolId) continue;
    const symbol = symbolsById.get(symbolId);
    if (!symbol) {
      throw new Error(`Unknown symbol reference ${symbolId} for file ${file.id}.`);
    }
    if (symbol.fileId !== file.id || !file.symbolIds.includes(symbolId)) {
      throw new Error(`Symbol ${symbolId} is not owned by file ${file.id}.`);
    }
    const submittedName = line.slice(line.indexOf(symbolId) + symbolId.length).trim();
    if (submittedName !== symbol.name) {
      throw new Error(`Symbol ${symbolId} must use its indexed name: ${symbol.name}.`);
    }
    if (seenSymbols.has(symbolId)) {
      throw new Error(`Descriptor contains duplicate symbol section ${symbolId}.`);
    }

    const expectedRange = `SOURCE L${symbol.startLine}-L${symbol.endLine}`;
    if (lines[lineIndex + 1] !== expectedRange) {
      throw new Error(
        `Symbol ${symbolId} must be followed by its indexed range: ${expectedRange}.`,
      );
    }
    seenSymbols.add(symbolId);
  }

  if (seenSymbols.size === 0) {
    throw new Error(`Descriptor for ${file.id} must include at least one indexed symbol.`);
  }
  if (sourceRangeCount !== seenSymbols.size) {
    throw new Error("Every SOURCE range must belong to an indexed symbol section.");
  }
}

export async function saveDescriptor(
  repositoryRoot: string,
  fileId: string,
  descriptor: string,
): Promise<DescriptorRecord> {
  const descriptorStorePath = join(repositoryRoot, DESCRIPTORS_PATH);

  return withFileMutationQueue(descriptorStorePath, async () => {
    const indexedFile = await readIndexedFile(repositoryRoot, fileId);
    validateDescriptor(descriptor, indexedFile.file, indexedFile.indexSymbols);

    const record: DescriptorRecord = {
      fileId: indexedFile.file.id,
      path: indexedFile.file.path,
      sourceHash: indexedFile.sourceHash,
      descriptorSourceHash: indexedFile.sourceHash,
      descriptor,
    };
    const store = await loadDescriptorStore(repositoryRoot);
    const descriptors = store.descriptors
      .filter((existing) => existing.fileId !== fileId)
      .concat(record)
      .sort((left, right) =>
        left.fileId < right.fileId ? -1 : left.fileId > right.fileId ? 1 : 0,
      );
    const nextStore: DescriptorStore = { version: 1, descriptors };

    await writeFile(
      descriptorStorePath,
      `${JSON.stringify(nextStore, null, 2)}\n`,
      "utf8",
    );

    return record;
  });
}
