import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";

const CONSUMPTION_PATH = join(".deciml", "consumption.json");

export type BenchmarkMode = "Control" | "Cold" | "Warm";

export interface ConsumptionArtifact {
  version: 1;
  mode: BenchmarkMode;
  fullFileReads: number;
  descriptorReads: number;
  symbolSourceReads: number;
  canonicalSourceLinesRead: number;
  canonicalSourceBytesRead: number;
  descriptorBytesRead: number;
  descriptorGenerationSourceBytes: number;
}

export type ConsumptionDelta = Partial<
  Omit<ConsumptionArtifact, "version" | "mode">
>;

export interface TextConsumption {
  lines: number;
  bytes: number;
}

export type ConsumptionRecorder = (
  repositoryRoot: string,
  delta: ConsumptionDelta,
) => Promise<void>;

export function measureTextConsumption(text: string): TextConsumption {
  if (text.length === 0) return { lines: 0, bytes: 0 };

  const lineBreaks = text.match(/\r\n|\n|\r/g)?.length ?? 0;
  const endsWithLineBreak = /(?:\r\n|\n|\r)$/.test(text);
  return {
    lines: lineBreaks + (endsWithLineBreak ? 0 : 1),
    bytes: Buffer.byteLength(text, "utf8"),
  };
}

export function parseBenchmarkMode(value: unknown): BenchmarkMode {
  if (typeof value === "string") {
    const mode = value.toLowerCase();
    if (mode === "control") return "Control";
    if (mode === "cold") return "Cold";
    if (mode === "warm") return "Warm";
  }

  throw new Error(
    "Deciml benchmark mode is required. Pass `--deciml-mode Control`, `Cold`, or `Warm`.",
  );
}

function serializeArtifact(artifact: ConsumptionArtifact): string {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

export async function startConsumptionSession(
  repositoryRoot: string,
  mode: BenchmarkMode,
): Promise<void> {
  const artifact: ConsumptionArtifact = {
    version: 1,
    mode,
    fullFileReads: 0,
    descriptorReads: 0,
    symbolSourceReads: 0,
    canonicalSourceLinesRead: 0,
    canonicalSourceBytesRead: 0,
    descriptorBytesRead: 0,
    descriptorGenerationSourceBytes: 0,
  };
  const directory = join(repositoryRoot, ".deciml");

  await mkdir(directory, { recursive: true });
  await writeFile(
    join(repositoryRoot, CONSUMPTION_PATH),
    serializeArtifact(artifact),
    "utf8",
  );
}

export const recordConsumption: ConsumptionRecorder = async (
  repositoryRoot,
  delta,
) => {
  const artifactPath = resolve(repositoryRoot, CONSUMPTION_PATH);

  await withFileMutationQueue(artifactPath, async () => {
    const current = JSON.parse(
      await readFile(artifactPath, "utf8"),
    ) as ConsumptionArtifact;
    const next: ConsumptionArtifact = {
      ...current,
      fullFileReads: current.fullFileReads + (delta.fullFileReads ?? 0),
      descriptorReads: current.descriptorReads + (delta.descriptorReads ?? 0),
      symbolSourceReads:
        current.symbolSourceReads + (delta.symbolSourceReads ?? 0),
      canonicalSourceLinesRead:
        current.canonicalSourceLinesRead +
        (delta.canonicalSourceLinesRead ?? 0),
      canonicalSourceBytesRead:
        current.canonicalSourceBytesRead +
        (delta.canonicalSourceBytesRead ?? 0),
      descriptorBytesRead:
        current.descriptorBytesRead + (delta.descriptorBytesRead ?? 0),
      descriptorGenerationSourceBytes:
        current.descriptorGenerationSourceBytes +
        (delta.descriptorGenerationSourceBytes ?? 0),
    };

    await writeFile(artifactPath, serializeArtifact(next), "utf8");
  });
};
