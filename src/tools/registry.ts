import { ModaiTool, ToolMetadata } from "./base.js";
import { UninstallTool } from "./uninstall.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

interface ModaiToolConfig {
  name: string;
  version: string;
  owner: string;
  repo: string;
  files: string[];
  dirs: string[];
  npmDeps: string[];
  main: string; // Add main field for the entry point of the tool
}

export class ToolRegistry {
  private tools = new Map<string, ModaiTool>();

  constructor() {
    this.loadTools();
  }

  register(name: string, tool: ModaiTool): void {
    this.tools.set(name, tool);
  }

  get(name: string): ModaiTool | undefined {
    return this.tools.get(name);
  }

  list(): ToolMetadata[] {
    return Array.from(this.tools.values()).map((tool) => tool.metadata);
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  private async loadTools(): Promise<void> {
    const modaiDir = path.join(os.homedir(), ".modai");
    try {
      const files = await fs.readdir(modaiDir);
      for (const file of files) {
        if (file.endsWith(".tool.json")) {
          const configPath = path.join(modaiDir, file);
          const configContent = await fs.readFile(configPath, "utf8");
          const toolConfig: ModaiToolConfig = JSON.parse(configContent);

          if (toolConfig.main) {
            try {
              const toolModulePath = path.join(modaiDir, toolConfig.main);
              // Dynamically import the tool module
              const toolModule = await import(toolModulePath);
              // Assuming the tool class is the default export or a named export matching the tool name
              const ToolClass = toolModule.default || toolModule[toolConfig.name];
              if (ToolClass && typeof ToolClass === 'function') {
                const toolInstance = new ToolClass();
                if (toolInstance instanceof ModaiTool) {
                  this.register(toolConfig.name, toolInstance);
                  console.log(`Successfully loaded tool: ${toolConfig.name}`);
                } else {
                  console.warn(`Tool ${toolConfig.name} from ${toolModulePath} is not an instance of ModaiTool.`);
                }
              } else {
                console.warn(`Could not find tool class for ${toolConfig.name} in ${toolModulePath}.`);
              }
            } catch (importError) {
              console.error(`Failed to load tool ${toolConfig.name} from ${toolConfig.main}:`, importError);
            }
          }
        }
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log(".modai directory not found, no custom tools to load.");
      } else {
        console.error("Error loading custom tools:", error);
      }
    }
  }
}
