import { createReadToolDefinition } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { openIndexedPath } from "../descriptors/store.js";

function resolveReadTarget(repositoryRoot: string, path: string): string {
  let normalizedPath = path.startsWith("@") ? path.slice(1) : path;
  if (normalizedPath === "~") {
    normalizedPath = homedir();
  } else if (normalizedPath.startsWith("~/")) {
    normalizedPath = join(homedir(), normalizedPath.slice(2));
  }
  return resolve(repositoryRoot, normalizedPath);
}

const normalRead = createReadToolDefinition(process.cwd());

export const decimlRead = {
  ...normalRead,

  async execute(toolCallId, params, signal, onUpdate, ctx) {
    const isFullFileRead = params.offset === undefined && params.limit === undefined;

    if (isFullFileRead) {
      const absolutePath = resolveReadTarget(ctx.cwd, params.path);
      const indexedFile = await openIndexedPath(ctx.cwd, absolutePath);

      if (indexedFile?.descriptor) {
        const { file, descriptor } = indexedFile;
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
    }

    return normalRead.execute(toolCallId, params, signal, onUpdate, ctx);
  },
} satisfies typeof normalRead;
