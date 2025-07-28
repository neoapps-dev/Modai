export interface ToolMetadata {
  name: string;
  description: string;
  example: string;
}

export abstract class ModaiTool {
  abstract metadata: ToolMetadata;

  // New abstract method for subclasses to implement actual execution logic
  protected abstract _execute(args: Record<string, any>): Promise<any>;

  // Concrete execute method that handles confirmation
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
