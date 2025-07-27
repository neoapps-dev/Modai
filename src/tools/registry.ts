import { ModaiTool, ToolMetadata } from "./base.js";

export class ToolRegistry {
  private tools = new Map<string, ModaiTool>();

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
}
