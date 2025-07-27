export interface ToolMetadata {
  name: string;
  description: string;
  example: string;
}

export abstract class ModaiTool {
  abstract metadata: ToolMetadata;
  abstract execute(args: Record<string, any>): Promise<any>;

  protected validateArgs(args: Record<string, any>, required: string[]): void {
    for (const key of required) {
      if (!(key in args)) {
        throw new Error(`Missing required argument: ${key}`);
      }
    }
  }
}
