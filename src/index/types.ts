export type SymbolKind =
  | "function"
  | "method"
  | "type"
  | "interface"
  | "enum"
  | "class"
  | "variable"
  | "suite"
  | "test"
  | "hook";

export interface BenchmarkCandidate {
  path: string;
  shortDescription: string;
}

export interface BenchmarkDefinition {
  repository: string;
  commit: string;
  taskPrompt: string;
  candidates: readonly BenchmarkCandidate[];
}

export interface BenchmarkRecord {
  repository: string;
  commit: string;
  taskPrompt: string;
  candidatePaths: string[];
}

export interface ExtractedSymbol {
  name: string;
  kind: SymbolKind;
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
  signature?: string;
}

export interface FileRecord {
  id: string;
  path: string;
  sourceHash: string;
  shortDescription: string;
  symbolIds: string[];
}

export interface SymbolRecord {
  id: string;
  fileId: string;
  name: string;
  kind: SymbolKind;
  startLine: number;
  endLine: number;
  signature?: string;
}

export interface DecimlIndex {
  version: 1;
  benchmark: BenchmarkRecord;
  files: FileRecord[];
  symbols: SymbolRecord[];
}

export interface DescriptorRecord {
  fileId: string;
  path: string;
  sourceHash: string;
  descriptorSourceHash: string;
  descriptor: string;
}

export interface DescriptorStore {
  version: 1;
  descriptors: DescriptorRecord[];
}

export interface IndexResult {
  repositoryRoot: string;
  indexPath: string;
  projectPath: string;
  fileCount: number;
  symbolCount: number;
}
