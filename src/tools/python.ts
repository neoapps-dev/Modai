import { ModaiTool, ToolMetadata } from "./base.js";
import { exec } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { randomUUID } from "crypto";
export class PythonTool extends ModaiTool {
  metadata: ToolMetadata = {
    name: "python",
    description:
      "Executes multi-line Python code snippets and returns the output.",
    example: "python(code='''\ndef foo():\n    return 42\nprint(foo())\n''')",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "The Python code to execute." },
      },
      required: ["code"],
    },
  };

  protected async _execute(args: Record<string, any>): Promise<any> {
    this.validateArgs(args, ["code"]);
    const pyCode = args.code;
    const fileName = `/tmp/${randomUUID()}.py`;
    try {
      writeFileSync(fileName, pyCode, "utf8");
      return new Promise((resolve) => {
        exec(`python3 ${fileName}`, (error, stdout, stderr) => {
          unlinkSync(fileName);
          if (error) {
            resolve({
              success: false,
              code: pyCode,
              output: stderr || error.message,
            });
            return;
          }
          resolve({
            success: true,
            code: pyCode,
            output: stdout.trim(),
          });
        });
      });
    } catch (e) {
      try {
        unlinkSync(fileName);
      } catch {}
      return {
        success: false,
        code: pyCode,
        output: JSON.stringify(e, null, 2),
      };
    }
  }
}
