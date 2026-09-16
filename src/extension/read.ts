import {
  createReadToolDefinition,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { openIndexedPath } from "../descriptors/store.js";
import {
  measureTextConsumption,
  type ConsumptionRecorder,
} from "../telemetry/session.js";

function resolveReadTarget(repositoryRoot: string, path: string): string {
  let normalizedPath = path.startsWith("@") ? path.slice(1) : path;
  if (normalizedPath === "~") {
    normalizedPath = homedir();
  } else if (normalizedPath.startsWith("~/")) {
    normalizedPath = join(homedir(), normalizedPath.slice(2));
  }
  return resolve(repositoryRoot, normalizedPath);
}

function sourceReturnedByRead(
  sourceText: string,
  offset: number | undefined,
  limit: number | undefined,
): string {
  const allLines = sourceText.split("\n");
  const startLine = offset ? Math.max(0, offset - 1) : 0;
  const selected =
    limit === undefined
      ? allLines.slice(startLine).join("\n")
      : allLines
          .slice(startLine, Math.min(startLine + limit, allLines.length))
          .join("\n");
  const truncation = truncateHead(selected);

  return truncation.firstLineExceedsLimit ? "" : truncation.content;
}

const normalRead = createReadToolDefinition(process.cwd());
const ignoreConsumption: ConsumptionRecorder = async () => {};

export function createDecimlRead(
  record: ConsumptionRecorder = ignoreConsumption,
  descriptorNavigationEnabled: () => boolean = () => true,
) {
  return {
    ...normalRead,

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const isFullFileRead =
        params.offset === undefined && params.limit === undefined;
      const absolutePath = resolveReadTarget(ctx.cwd, params.path);
      const indexedFile = await openIndexedPath(ctx.cwd, absolutePath);

      if (
        isFullFileRead &&
        indexedFile?.descriptor &&
        descriptorNavigationEnabled()
      ) {
        const { file, descriptor } = indexedFile;
        const descriptorConsumption = measureTextConsumption(descriptor.descriptor);
        await record(ctx.cwd, {
          descriptorReads: 1,
          descriptorBytesRead: descriptorConsumption.bytes,
        });

        return {
          content: [
            {
              type: "text" as const,
              text:
                `HIT ${file.id}\n` +
                `PATH ${file.path}\n\n` +
                `${descriptor.descriptor}\n` +
                "Use deciml_source @Sxx for canonical implementation source.",
            },
          ],
          details: undefined,
        };
      }

      const result = await normalRead.execute(
        toolCallId,
        params,
        signal,
        onUpdate,
        ctx,
      );

      if (indexedFile) {
        const sourceText = sourceReturnedByRead(
          indexedFile.sourceText,
          params.offset,
          params.limit,
        );
        const sourceConsumption = measureTextConsumption(sourceText);
        await record(ctx.cwd, {
          ...(isFullFileRead ? { fullFileReads: 1 } : {}),
          canonicalSourceLinesRead: sourceConsumption.lines,
          canonicalSourceBytesRead: sourceConsumption.bytes,
        });
      }

      return result;
    },
  } satisfies typeof normalRead;
}

export const decimlRead = createDecimlRead();
