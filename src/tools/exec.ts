import { exec } from "child_process";
import { promisify } from "util";
import { ModaiTool, ToolMetadata } from "./base.js";

const execAsync = promisify(exec);

export class ExecTool extends ModaiTool {
  metadata: ToolMetadata = {
    name: "exec",
    description: "Executes a shell command.",
    example: "exec(command='ls -la')",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute.",
        },
      },
      required: ["command"],
    },
  };

  protected async _execute(args: Record<string, any>): Promise<any> {
    this.validateArgs(args, ["command"]);

    try {
      const { stdout, stderr } = await execAsync(args.command, {
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      });

      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        success: true,
      };
    } catch (error: any) {
      return {
        stdout: error.stdout?.trim() || "",
        stderr: error.stderr?.trim() || error.message,
        success: false,
        code: error.code,
      };
    }
  }
}
