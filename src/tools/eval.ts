import { ModaiTool, ToolMetadata } from "./base.js";

export class EvalTool extends ModaiTool {
  metadata: ToolMetadata = {
    name: "eval",
    description:
      "Evaluates a JavaScript expression or multi-line statement block and returns result or error. Use 'return' for explicit output. Example: eval(code='let x = 5; return x * 2;')",
    example: "eval(code='let y = 10; return y * 3;')",
  };

  async execute(args: Record<string, any>): Promise<any> {
    this.validateArgs(args, ["code"]);
    try {
      // Execute full JavaScript blocks (multi-line), allow 'return' for output
      const result = Function("'use strict';\n" + args.code)();
      return {
        success: true,
        code: args.code,
        output: typeof result === "undefined" ? "Code executed successfully (no explicit return value)." : (typeof result === "string" ? result : JSON.stringify(result, null, 2)),
      };
    } catch (e: any) {
      return {
        success: false,
        code: args.code,
        output: e?.message ?? String(e),
      };
    }
  }
}
