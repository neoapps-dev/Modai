import { ModaiTool, ToolMetadata } from "./base.js";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";

interface ModaiToolConfig {
  name: string;
  version: string;
  owner: string;
  repo: string;
  files: string[];
  dirs: string[];
  npmDeps: string[];
}

export class UninstallTool extends ModaiTool {
  metadata: ToolMetadata = {
    name: "uninstall",
    description: "Uninstalls a Modai tool.",
    example: "uninstall(name=mytool)",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The name of the tool to uninstall.",
        },
      },
      required: ["name"],
    },
  };

  protected async _execute(args: Record<string, any>): Promise<any> {
    this.validateArgs(args, this.metadata.parameters.required);
    const toolName = args.name;
    const modaiDir = path.join(os.homedir(), ".modai");
    const toolConfigFileName = `${toolName}.tool.json`;
    const toolConfigPath = path.join(modaiDir, toolConfigFileName);

    try {
      const toolConfigContent = await fs.readFile(toolConfigPath, "utf8");
      const toolConfig: ModaiToolConfig = JSON.parse(toolConfigContent);

      // Remove files
      for (const file of toolConfig.files) {
        const filePath = path.join(modaiDir, file);
        try {
          await fs.unlink(filePath);
          if (process.env.DEBUG === "1") {
            console.log(`Removed file: ${filePath}`);
          }
        } catch (error: any) {
          if (error.code !== "ENOENT") {
            console.warn(`Could not remove file ${filePath}: ${error.message}`);
          }
        }
      }

      // Remove directories
      // Sort directories by length in descending order to ensure nested directories are removed first
      const sortedDirs = [...toolConfig.dirs].sort(
        (a, b) => b.length - a.length,
      );
      for (const dir of sortedDirs) {
        const dirPath = path.join(modaiDir, dir);
        try {
          await fs.rm(dirPath, { recursive: true, force: true });
          if (process.env.DEBUG === "1") {
            console.log(`Removed directory: ${dirPath}`);
          }
        } catch (error: any) {
          if (error.code !== "ENOENT") {
            console.warn(
              `Could not remove directory ${dirPath}: ${error.message}`,
            );
          }
        }
      }

      // Remove the tool's config file
      await fs.unlink(toolConfigPath);
      return `Successfully uninstalled ${toolName}.`;
    } catch (error: any) {
      if (error.code === "ENOENT") {
        throw new Error(`Tool '${toolName}' not found. Is it installed?`);
      }
      throw new Error(
        `Failed to uninstall tool '${toolName}': ${error.message}`,
      );
    }
  }
}
