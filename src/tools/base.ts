export interface ToolMetadata {
  name: string;
  description: string;
  example: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
}

export abstract class ModaiTool {
  abstract metadata: ToolMetadata;
  protected abstract _execute(args: Record<string, any>): Promise<any>;
  async execute(args: Record<string, any>): Promise<any> {
    return this._execute(args);
  }

  protected validateArgs(args: Record<string, any>, required: string[]): void {
    for (const key of required) {
      if (!(key in args)) {
        throw new Error(`Missing required argument: ${key}`);
      }
    }
  }
}
