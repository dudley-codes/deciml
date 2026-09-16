import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const PROJECT_INDEX_PATH = join(".deciml", "project.md");

const decimlProject = defineTool({
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

export default function decimlExtension(pi: ExtensionAPI): void {
  pi.registerTool(decimlProject);
}
