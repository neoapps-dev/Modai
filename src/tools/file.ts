import { readFile, writeFile, readdir, stat } from "fs/promises";
import { join } from "path";
import { ModaiTool, ToolMetadata } from "./base.js";

export class FileTool extends ModaiTool {
  metadata: ToolMetadata = {
    name: "file",
    description: "Performs file operations like read, write, and list.",
    example: "file(action='read', path='/path/to/file')",
  };

  protected async _execute(args: Record<string, any>): Promise<any> {
    this.validateArgs(args, ["action", "path"]);

    const { action, path, content } = args;

    try {
      switch (action) {
        case "read":
          const data = await readFile(path, "utf8");
          return { content: data, success: true };

        case "write":
          if (!content) throw new Error("write action requires content");
          await writeFile(path, content, "utf8");
          return { message: "File written successfully", success: true };

        case "list":
          const items = await readdir(path);
          const details = await Promise.all(
            items.map(async (item) => {
              const itemPath = join(path, item);
              const stats = await stat(itemPath);
              return {
                name: item,
                type: stats.isDirectory() ? "directory" : "file",
                size: stats.size,
                modified: stats.mtime,
              };
            }),
          );
          return { items: details, success: true };

        default:
          throw new Error(`Unknown file action: ${action}`);
      }
    } catch (error: any) {
      return {
        error: error.message,
        success: false,
      };
    }
  }
}
