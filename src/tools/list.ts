import { ModaiTool, ToolMetadata } from "./base.js";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
interface ModaiToolConfig {
  name: string;
  version: string;
}
export class ListTool extends ModaiTool {
  metadata: ToolMetadata = {
    name: "list",
    description: "Lists all installed Modai tools.",
    example: "/list",
    parameters: { type: "object", properties: {}, required: [] },
  };
  protected async _execute(args: Record<string, any>): Promise<any> {
    const modaiDir = path.join(os.homedir(), ".modai");
    let installedTools: ModaiToolConfig[] = [];
    try {
      const files = await fs.readdir(modaiDir);
      for (const file of files) {
        if (file.endsWith(".tool.json")) {
          const content = await fs.readFile(path.join(modaiDir, file), "utf8");
          installedTools.push(JSON.parse(content));
        }
      }
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return "No Modai tools installed.";
      }
      throw new Error(`Failed to read installed tools: ${error.message}`);
    }
    if (installedTools.length === 0) {
      return "No Modai tools installed.";
    }
    let result = "";
    installedTools.forEach((tool) => {
      result += `- ${tool.name} (v${tool.version})\n`;
    });
    return result.trim();
  }
}
