import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { openIndexedFile, saveDescriptor } from "../descriptors/store.js";

const PROJECT_INDEX_PATH = join(".deciml", "project.md");

export const decimlProject = defineTool({
  name: "deciml_project",
  label: "Deciml Project",
  description: "Return the deterministic Deciml project overview for the current repository.",
  promptSnippet: "Read the Deciml project overview for indexed file discovery",
  parameters: Type.Object({}),

  async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
    const projectIndexPath = join(ctx.cwd, PROJECT_INDEX_PATH);

    try {
      const projectIndex = await readFile(projectIndexPath, "utf8");
      return {
        content: [{ type: "text", text: projectIndex }],
        details: { path: PROJECT_INDEX_PATH },
      };
    } catch (error: unknown) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : undefined;
      if (code === "ENOENT") {
        throw new Error(
          "No Deciml project index exists for this repository. Run `deciml index` first.",
        );
      }
      throw error;
    }
  },
});

export const decimlOpen = defineTool({
  name: "deciml_open",
  label: "Deciml Open",
  description:
    "Open an indexed Deciml file. A descriptor miss returns deterministic symbol identity and the complete canonical source.",
  promptSnippet: "Open an indexed file through its Deciml file reference",
  parameters: Type.Object({
    fileId: Type.String({ description: "Deterministic file reference, for example @F01" }),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const indexedFile = await openIndexedFile(ctx.cwd, params.fileId);
    const { file, sourceHash, sourceText, symbols } = indexedFile;

    if (indexedFile.descriptor) {
      return {
        content: [
          {
            type: "text",
            text: `HIT ${file.id}\nPATH ${file.path}\n\n${indexedFile.descriptor.descriptor}`,
          },
        ],
        details: {
          status: "HIT",
          fileId: file.id,
          path: file.path,
          sourceHash,
        },
      };
    }

    const symbolCatalog = symbols
      .map(
        (symbol) =>
          `${symbol.kind.toUpperCase()} ${symbol.id} ${symbol.name}\n` +
          `SOURCE L${symbol.startLine}-L${symbol.endLine}`,
      )
      .join("\n\n");
    const text =
      `MISS ${file.id}\n` +
      `PATH ${file.path}\n` +
      `SOURCE_HASH ${sourceHash}\n\n` +
      `INDEXED SYMBOLS\n${symbolCatalog}\n\n` +
      "DESCRIPTOR INSTRUCTIONS\n" +
      "Produce task-independent semantic pseudo-code describing this file itself, not the current task.\n" +
      "Begin with exactly:\n" +
      `FILE ${file.id}\n` +
      `PATH ${file.path}\n` +
      "For each described symbol, copy its indexed @S reference and name above, then place its exact SOURCE range on the following line.\n" +
      "Use @S references only in symbol section headers. Do not invent or copy file or symbol identity.\n" +
      `Save the complete descriptor with deciml_save_descriptor for ${file.id}.\n\n` +
      `CANONICAL SOURCE\n${sourceText}`;

    return {
      content: [{ type: "text", text }],
      details: {
        status: "MISS",
        fileId: file.id,
        path: file.path,
        sourceHash,
      },
    };
  },
});

export const decimlSaveDescriptor = defineTool({
  name: "deciml_save_descriptor",
  label: "Deciml Save Descriptor",
  description:
    "Validate and persist task-independent semantic pseudo-code for an indexed Deciml file.",
  promptSnippet: "Save a semantic descriptor using deterministic Deciml identity",
  parameters: Type.Object({
    fileId: Type.String({ description: "Deterministic file reference, for example @F01" }),
    descriptor: Type.String({
      description: "Complete task-independent descriptor produced from a deciml_open miss",
    }),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const record = await saveDescriptor(ctx.cwd, params.fileId, params.descriptor);

    return {
      content: [
        {
          type: "text",
          text: `Saved descriptor for ${record.fileId} (${record.path}).`,
        },
      ],
      details: {
        fileId: record.fileId,
        path: record.path,
        sourceHash: record.sourceHash,
        descriptorSourceHash: record.descriptorSourceHash,
      },
    };
  },
});

export default function decimlExtension(pi: ExtensionAPI): void {
  pi.registerTool(decimlProject);
  pi.registerTool(decimlOpen);
  pi.registerTool(decimlSaveDescriptor);
}
