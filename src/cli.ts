#!/usr/bin/env node
import { createInterface } from "readline";
import { Modai, ModaiConfig } from "./index.js";
import chalk from 'chalk';

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
    console.log(chalk.blue(`🤖 Modai CLI started with ${chalk.bold(this.config.provider)} provider`));
    console.log(chalk.gray("Type /help for commands or just chat naturally"));
    console.log(chalk.gray("---"));
    this.rl.prompt();
    this.rl.on("line", async (input: string) => {
      const line = input.trim();

      if (line === "/quit" || line === "/exit") {
        console.log(chalk.yellow("Goodbye!"));
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
      console.log(chalk.yellow("\nGoodbye!"));
      process.exit(0);
    });
  }

  private async handleChat(message: string): Promise<void> {
    try {
      console.log(chalk.blue("🤔 Thinking..."));

      const initialPrompt = `You are an AI agent. When the user asks for multiple actions, provide all the tool calls in a single response. User request: ${message}`;
      let response = await this.modai.chat(initialPrompt);

      let maxTurns = 5;
      for (let turn = 0; turn < maxTurns; turn++) {
        const toolResults = await this.modai.extractAndExecuteTools(response);

        if (toolResults.length === 0) {
          const cleanResponse = this.modai.cleanToolsFromResponse(response);
          if (cleanResponse.trim()) {
            console.log(chalk.bold("🤖"), cleanResponse);
          }
          return;
        }

        const toolContexts: string[] = [];
        for (const { tool, result } of toolResults) {
          console.log(chalk.yellow(`🔧 Executing tool: ${tool}`));
          if (result.success) {
            console.log(chalk.green("✅ Tool executed successfully"));
            if (process.env.DEBUG === "1") {
              console.log(`--- OUTPUT:\n${JSON.stringify(result, null, 2)}\n--- OUTPUT;`);
            }
            if (result.data?.stdout) {
              console.log(result.data.stdout);
            } else if (result.data?.content) {
              console.log(result.data.content);
            } else if (result.data?.items) {
              console.log("Files/Directories:");
              const items = result.data.items.map((item: any) => `${item.type === "directory" ? "📁" : "📄"} ${item.name}`).join("\n");
              console.log(items);
            }
            const output = JSON.stringify(result.data, null, 2);
            const toolRequest = this.modai.findToolRequestInResponse(response, tool);
            toolContexts.push(`You executed ${tool} tool with these parameters: ${JSON.stringify(toolRequest?.arguments || {})}. The result was: ${output}`);
          } else {
            console.log(chalk.red("❌ Tool failed:"), result.error);
            toolContexts.push(`Tool ${tool} failed: ${result.error}`);
          }
        }

        const followUpMessage = `You are in an agentic loop. You previously said: "${response}"\n\nThis led to tool executions with the following results:\n${toolContexts.join("\n")}\n\nNow, decide the next step. You can call more tools or provide a final response to the user.`;
        console.log(chalk.blue("🤔 Continuing..."));
        response = await this.modai.chatWithContext(followUpMessage);
      }

      console.log(chalk.red("⚠️ Reached max turns, stopping to prevent infinite loop."));
    } catch (error) {
      console.error(chalk.red("❌ Error:"), error instanceof Error ? error.message : error);
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
        console.log(chalk.green("✅ Tool result:"), JSON.stringify(result.data, null, 2));
      } else {
        console.log(chalk.red("❌ Tool failed:"), result.error);
      }
    } catch (error) {
      console.error(chalk.red("❌ Tool execution error:"), error);
    }
  }

  private showHelp(): void {
    console.log(chalk.cyan(`
📖 Modai CLI Commands:
  /help     - Show this help message
  /tools    - List available tools
  /tool <name> <args> - Execute a tool with arguments
  /quit     - Exit the CLI

🔧 Example tool usage:
  /tool exec command "ls -la"
  /tool file read path "/etc/hosts"

💬 Or just chat naturally and let the AI use tools for you!
`));
  }

  private showTools(): void {
    const tools = this.modai["tools"].list();
    console.log(chalk.cyan("🔧 Available tools:"));
    tools.forEach((tool) => {
      console.log(chalk.bold(`  - ${tool.name}`));
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
    console.error(chalk.red("❌ Failed to start CLI:"), error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}