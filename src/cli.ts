#!/usr/bin/env node
import { createInterface } from "readline";
import { Modai, ModaiConfig } from "./index.js";
interface CliConfig extends ModaiConfig {
  name?: string;
}

class ModaiCLI {
  private modai: Modai;
  private rl: any;
  private config: CliConfig;

  constructor(config: CliConfig) {
    this.config = config;
    this.modai = new Modai(config);
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: `${config.name || "modai"}> `,
    });
  }

  async start(): Promise<void> {
    console.log(`🤖 Modai CLI started with ${this.config.provider} provider`);
    console.log("Type /help for commands or just chat naturally");
    console.log("---");
    this.rl.prompt();
    this.rl.on("line", async (input: string) => {
      const line = input.trim();

      if (line === "/quit" || line === "/exit") {
        console.log("Goodbye!");
        process.exit(0);
      }

      if (line === "/help") {
        this.showHelp();
        this.rl.prompt();
        return;
      }

      if (line === "/tools") {
        this.showTools();
        this.rl.prompt();
        return;
      }

      if (line.startsWith("/tool ")) {
        await this.executeTool(line.substring(6));
        this.rl.prompt();
        return;
      }

      if (line === "") {
        this.rl.prompt();
        return;
      }

      await this.handleChat(line);
      this.rl.prompt();
    });

    this.rl.on("close", () => {
      console.log("\nGoodbye!");
      process.exit(0);
    });
  }

  private async handleChat(message: string): Promise<void> {
    try {
      console.log("🤔 Thinking...");
      let response = await this.modai.chat(message);
      const toolResults = await this.modai.extractAndExecuteTools(response);
      if (toolResults.length > 0) {
        const toolContexts: string[] = [];
        for (const { tool, result } of toolResults) {
          console.log(`🔧 Executing tool: ${tool}`);
          if (result.success) {
            console.log("✅ Tool executed successfully");
            if (process.env.DEBUG === "1") {
              console.log(
                `--- OUTPUT:\n${JSON.stringify(result, null, 2)}\n--- OUTPUT;`,
              );
            }
            let output = "";
            if (result.data?.stdout) {
              output = result.data.stdout;
              console.log(output);
            } else if (result.data?.content) {
              output = result.data.content;
              console.log(output);
            } else if (result.data?.items) {
              console.log("Files/Directories:");
              const items = result.data.items
                .map(
                  (item: any) =>
                    `${item.type === "directory" ? "📁" : "📄"} ${item.name}`,
                )
                .join("\n");
              console.log(items);
              output = items;
            }
            const toolRequest = this.modai.findToolRequestInResponse(
              response,
              tool,
            );
            toolContexts.push(
              `You executed ${tool} tool with these parameters: ${JSON.stringify(toolRequest?.arguments || {})}. The result was: ${output}`,
            );
          } else {
            console.log("❌ Tool failed:", result.error);
            toolContexts.push(`Tool ${tool} failed: ${result.error}`);
          }
        }
        if (toolContexts.length > 0) {
          const followUpMessage = `Original user question: "${message}"\n\n${toolContexts.join("\n")}\n\nBased on the tool execution results above, please provide a complete and helpful response to the user's original question. You know exactly what was executed and what the results mean.`;

          console.log("🤔 Completing response...");
          const followUpResponse =
            await this.modai.chatWithContext(followUpMessage);
          const cleanFollowUp =
            this.modai.cleanToolsFromResponse(followUpResponse);

          if (cleanFollowUp.trim()) {
            console.log("🤖", cleanFollowUp);
          }
          return;
        }
      }

      const cleanResponse = this.modai.cleanToolsFromResponse(response);
      if (cleanResponse.trim()) {
        console.log("🤖", cleanResponse);
      }
    } catch (error) {
      console.error(
        "❌ Error:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  private async executeTool(command: string): Promise<void> {
    try {
      const [toolName, ...args] = command.split(" ");
      const toolArgs: Record<string, any> = {};
      for (let i = 0; i < args.length; i += 2) {
        if (i + 1 < args.length) {
          toolArgs[args[i]] = args[i + 1];
        }
      }

      const result = await this.modai.processRequest({
        protocol: "modai",
        tool: toolName,
        arguments: toolArgs,
      });

      if (result.success) {
        console.log("✅ Tool result:", JSON.stringify(result.data, null, 2));
      } else {
        console.log("❌ Tool failed:", result.error);
      }
    } catch (error) {
      console.error("❌ Tool execution error:", error);
    }
  }

  private showHelp(): void {
    console.log(`
📖 Modai CLI Commands:
  /help     - Show this help
  /tools    - List available tools
  /tool <name> <args> - Execute tool directly
  /quit     - Exit CLI

🔧 Example tool usage:
  /tool exec name command value "ls -la"
  /tool file action read path "/etc/hosts"

💬 Or just chat naturally and let AI use tools automatically!
    `);
  }

  private showTools(): void {
    const tools = this.modai["tools"].list();
    console.log("🔧 Available tools:");
    tools.forEach((tool) => {
      console.log(`  - Name: ${tool.name}`);
      console.log(`    Description: ${tool.description}`);
      console.log(`    Example: ${tool.example}`);
    });
  }
}

function parseArgs(): CliConfig {
  const args = process.argv.slice(2);
  const config: CliConfig = {
    provider: "custom",
    baseUrl: process.env.API_URL,
    name: "modai",
    model: "gpt-4.1",
    apiKey: process.env.API_KEY,
  };

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];

    switch (key) {
      case "--provider":
        config.provider = value as any;
        break;
      case "--api-key":
        config.apiKey = value;
        break;
      case "--base-url":
        config.baseUrl = value;
        break;
      case "--model":
        config.model = value;
        break;
      case "--name":
        config.name = value;
        break;
    }
  }

  return config;
}

async function main() {
  try {
    const config = parseArgs();
    const cli = new ModaiCLI(config);
    await cli.start();
  } catch (error) {
    console.error("❌ Failed to start CLI:", error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
