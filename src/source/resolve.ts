import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { loadIndex } from "../index/load-index.js";

export interface ResolvedSymbolSource {
  fileId: string;
  path: string;
  symbolId: string;
  symbolName: string;
  startLine: number;
  endLine: number;
  sourceText: string;
}

function readLineRange(
  sourceText: string,
  startLine: number,
  endLine: number,
): string | undefined {
  const lineStarts = [0];
  const lineEnds: number[] = [];

  for (const match of sourceText.matchAll(/\r\n|\n|\r/g)) {
    lineEnds.push(match.index);
    lineStarts.push(match.index + match[0].length);
  }

  const startOffset = lineStarts[startLine - 1];
  const endOffset = lineEnds[endLine - 1] ??
    (endLine === lineStarts.length ? sourceText.length : undefined);

  if (startOffset === undefined || endOffset === undefined || endLine < startLine) {
    return undefined;
  }

  return sourceText.slice(startOffset, endOffset);
}

export async function resolveSymbolSource(
  repositoryRoot: string,
  symbolId: string,
): Promise<ResolvedSymbolSource> {
  const index = await loadIndex(repositoryRoot);
  const symbol = index.symbols.find((candidate) => candidate.id === symbolId);

  if (!symbol) {
    throw new Error(`Unknown Deciml symbol reference: ${symbolId}.`);
  }

  const file = index.files.find((candidate) => candidate.id === symbol.fileId);
  if (!file) {
    throw new Error(
      `Index symbol ${symbol.id} references unknown file ${symbol.fileId}.`,
    );
  }
  if (!file.symbolIds.includes(symbol.id)) {
    throw new Error(`Index file ${file.id} does not reference symbol ${symbol.id}.`);
  }

  const currentSource = await readFile(join(repositoryRoot, file.path), "utf8");
  const sourceText = readLineRange(
    currentSource,
    symbol.startLine,
    symbol.endLine,
  );

  if (sourceText === undefined) {
    throw new Error(
      `Indexed range L${symbol.startLine}-L${symbol.endLine} for symbol ${symbol.id} ` +
        `is outside the current file ${file.path}.`,
    );
  }

  return {
    fileId: file.id,
    path: file.path,
    symbolId: symbol.id,
    symbolName: symbol.name,
    startLine: symbol.startLine,
    endLine: symbol.endLine,
    sourceText,
  };
}
