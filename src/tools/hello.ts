import { ModaiTool, ToolMetadata } from "./base.js";

export class HelloTool extends ModaiTool {
  metadata: ToolMetadata = {
    name: "hello",
    description: "Returns a friendly hello message.",
    example: "hello(name='world')",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The name to greet." },
      },
      required: [],
    },
  };

  protected async _execute(args: Record<string, any>): Promise<any> {
    const name = args.name || "world";
    return {
      message: `Hello, ${name}! 👋`,
      success: true,
    };
  }
}
