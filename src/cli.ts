#!/usr/bin/env node
import { Modai, ModaiConfig } from "./index.js";
import chalk from "chalk";
import ora from "ora";
import enquirer from "enquirer";
const { prompt } = enquirer;
import boxen from "boxen";

interface CliConfig extends ModaiConfig {
  name?: string;
}

class ModaiCLI {
  private modai: Modai;
  private config: CliConfig;
  constructor(config: CliConfig) {
    this.config = config;
    this.modai = new Modai(config);
  }

  async start(): Promise<void> {
    const asciiArt = `
      ███╗   ███╗ ██████╗ ██████╗  █████╗ ██╗
      ████╗ ████║██╔═══██╗██╔══██╗██╔══██╗██║
      ██╔████╔██║██║   ██║██║  ██║███████║██║
      ██║╚██╔╝██║██║   ██║██║  ██║██╔══██║██║
      ██║ ╚═╝ ██║╚██████╔╝██████╔╝██║  ██║██║
      ╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝
`;
    console.log(chalk.blue(asciiArt));
    console.log(chalk.gray("Type /help for commands or just chat naturally"));
    console.log(chalk.gray("---"));

    const spinner = ora(chalk.blue("Compiling User-Tools...")).start();
    await this.modai.waitForReady();
    spinner.stop();

    while (true) {
      const { input } = await prompt<{ input: string }>({
        type: "input",
        name: "input",
        message: `${this.config.name || "modai"}>`,
      });

      const line = input.trim();
      if (line === "/quit" || line === "/exit") {
        console.log(chalk.yellow("Goodbye!"));
        process.exit(0);
      }

      if (line === "/help") {
        this.showHelp();
        continue;
      }

      if (line === "/tools") {
        this.showTools();
        continue;
      }

      if (line.startsWith("/tool ")) {
        await this.executeTool(line.substring(6));
        continue;
      }

      if (line.startsWith("/install ")) {
        await this.executeInstall(line.substring(9));
        continue;
      }

      if (line === "/list") {
        await this.executeList();
        continue;
      }

      if (line.startsWith("/update")) {
        await this.executeUpdate(line.substring(8).trim());
        continue;
      }

      if (line.startsWith("/uninstall ")) {
        await this.executeUninstall(line.substring(11));
        continue;
      }

      if (line === "/list") {
        await this.executeList();
        continue;
      }

      if (line === "") {
        continue;
      }

      await this.handleChat(line);
    }
  }

  private async handleChat(message: string): Promise<void> {
    const spinner = ora(chalk.blue("🤔 Thinking...")).start();
    try {
      const initialPrompt = `You are an AI agent. When the user asks for multiple actions, provide all the tool calls in a single response. User request: ${message}`;
      let response = await this.modai.chat(initialPrompt);

      let maxTurns = 5;
      for (let turn = 0; turn < maxTurns; turn++) {
        const toolRequests = this.modai.extractAndExecuteTools(response);
        const toolResults: Array<{ tool: string; result: any }> = [];

        for (const toolRequest of toolRequests) {
          const toolName = toolRequest.tool;
          const toolArgs = JSON.stringify(toolRequest.arguments, null, 2);
          const confirmed = await this.promptForConfirmation(
            `Execute tool '${toolName}' with arguments:\n${toolArgs}\nDo you want to proceed?`,
          );

          if (confirmed) {
            spinner.text = chalk.yellow(`🔧 Executing tool: ${toolName}`);
            try {
              const result = await this.modai.processRequest(toolRequest);
              toolResults.push({ tool: toolName, result });
            } catch (e) {
              console.log("❌ Tool execution failed:", e);
              toolResults.push({
                tool: toolName,
                result: {
                  success: false,
                  error: e instanceof Error ? e.message : String(e),
                },
              });
            }
          } else {
            console.log(`🚫 Tool '${toolName}' execution cancelled by user.`);
            toolResults.push({
              tool: toolName,
              result: {
                success: false,
                error: "Tool execution cancelled by user.",
              },
            });
          }
        }

        if (toolResults.length === 0) {
          const cleanResponse = this.modai.cleanToolsFromResponse(response);
          if (cleanResponse.trim()) {
            spinner.succeed(chalk.bold("🤖 Assistant:"));
            console.log(
              boxen(cleanResponse, {
                padding: 1,
                margin: 1,
                borderStyle: "round",
                borderColor: "green",
              }),
            );
          } else {
            spinner.stop();
          }
          return;
        }

        const toolContexts: string[] = [];
        for (const { tool, result } of toolResults) {
          spinner.text = chalk.yellow(`🔧 Executing tool: ${tool}`);
          if (result.success) {
            spinner.succeed(
              chalk.green(`✅ Tool ${tool} executed successfully`),
            );
            if (process.env.DEBUG === "1") {
              console.log(
                boxen(JSON.stringify(result, null, 2), {
                  title: "Debug Output",
                  padding: 1,
                  margin: 1,
                  borderColor: "gray",
                }),
              );
            }
            if (result.data?.stdout) {
              console.log(
                boxen(String(result.data.stdout), {
                  title: "Output",
                  padding: 1,
                  margin: 1,
                  borderColor: "cyan",
                }),
              );
            } else if (result.data?.content) {
              console.log(
                boxen(result.data.content, {
                  title: "Content",
                  padding: 1,
                  margin: 1,
                  borderColor: "cyan",
                }),
              );
            } else if (result.data?.items) {
              const items = result.data.items
                .map(
                  (item: any) =>
                    `${item.type === "directory" ? "📁" : "📄"} ${item.name}`,
                )
                .join("\n");
              console.log(
                boxen(items, {
                  title: "Files/Directories",
                  padding: 1,
                  margin: 1,
                  borderColor: "cyan",
                }),
              );
            }
            const output = JSON.stringify(result.data, null, 2);
            const toolRequest = this.modai.findToolRequestInResponse(
              response,
              tool,
            );
            toolContexts.push(
              `You executed ${tool} tool with these parameters: ${JSON.stringify(toolRequest?.arguments || {})}. The result was: ${output}`,
            );
          } else {
            spinner.fail(chalk.red(`❌ Tool ${tool} failed:`));
            console.log(
              boxen(result.error, {
                title: "Error",
                padding: 1,
                margin: 1,
                borderColor: "red",
              }),
            );
            toolContexts.push(`Tool ${tool} failed: ${result.error}`);
          }
        }

        const followUpMessage = `You are in an agentic loop. You previously said: "${response}"\n\nThis led to tool executions with the following results:\n${toolContexts.join("\n")}\n\nNow, decide the next step. You can call more tools or provide a final response to the user.`;
        spinner.text = chalk.blue("🤔 Continuing...");
        spinner.start();
        response = await this.modai.chatWithContext(followUpMessage);
      }

      spinner.warn(
        chalk.red("⚠️ Reached max turns, stopping to prevent infinite loop."),
      );
    } catch (error) {
      spinner.fail(chalk.red("❌ Error:"));
      console.error(
        boxen(error instanceof Error ? error.message : String(error), {
          title: "Error",
          padding: 1,
          margin: 1,
          borderColor: "red",
        }),
      );
    }
  }

  private async executeTool(command: string): Promise<void> {
    const spinner = ora(chalk.blue("Executing tool...")).start();
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
        spinner.succeed(chalk.green("✅ Tool result:"));
        console.log(
          boxen(JSON.stringify(result.data, null, 2), {
            padding: 1,
            margin: 1,
            borderStyle: "round",
            borderColor: "green",
          }),
        );
      } else {
        spinner.fail(chalk.red("❌ Tool failed:"));
        console.log(
          boxen(result.error || "", {
            padding: 1,
            margin: 1,
            borderStyle: "round",
            borderColor: "red",
          }),
        );
      }
    } catch (error) {
      spinner.fail(chalk.red("❌ Tool execution error:"));
      console.error(
        boxen(error instanceof Error ? error.message : String(error), {
          title: "Error",
          padding: 1,
          margin: 1,
          borderColor: "red",
        }),
      );
    }
  }

  private async executeUpdate(repo?: string): Promise<void> {
    const spinner = ora(chalk.blue(`Checking for updates...`)).start();
    try {
      const args: { repo?: string } = {};
      if (repo) {
        args.repo = repo;
      }
      const result = await this.modai.processRequest({
        protocol: "modai",
        tool: "update",
        arguments: args,
      });

      if (result.success) {
        spinner.succeed(chalk.green(`✅ ${result.data}`));
      } else {
        spinner.fail(chalk.red(`❌ Update failed: ${result.error}`));
        console.log(
          boxen(result.error || "", {
            padding: 1,
            margin: 1,
            borderStyle: "round",
            borderColor: "red",
          }),
        );
      }
    } catch (error) {
      spinner.fail(chalk.red("❌ Update error:"));
      console.error(
        boxen(error instanceof Error ? error.message : String(error), {
          title: "Error",
          padding: 1,
          margin: 1,
          borderColor: "red",
        }),
      );
    }
  }

  private async executeList(): Promise<void> {
    const spinner = ora(chalk.blue(`Listing installed tools...`)).start();
    try {
      const result = await this.modai.processRequest({
        protocol: "modai",
        tool: "list",
        arguments: {},
      });

      if (result.success) {
        spinner.succeed(chalk.green(`✅ Installed Tools:`));
        console.log(
          boxen(result.data || "No tools installed.", {
            padding: 1,
            margin: 1,
            borderStyle: "round",
            borderColor: "green",
          }),
        );
      } else {
        spinner.fail(chalk.red(`❌ Failed to list tools: ${result.error}`));
        console.log(
          boxen(result.error || "", {
            padding: 1,
            margin: 1,
            borderStyle: "round",
            borderColor: "red",
          }),
        );
      }
    } catch (error) {
      spinner.fail(chalk.red("❌ List error:"));
      console.error(
        boxen(error instanceof Error ? error.message : String(error), {
          title: "Error",
          padding: 1,
          margin: 1,
          borderColor: "red",
        }),
      );
    }
  }

  private async executeUninstall(toolName: string): Promise<void> {
    const spinner = ora(chalk.blue(`Uninstalling ${toolName}...`)).start();
    try {
      const result = await this.modai.processRequest({
        protocol: "modai",
        tool: "uninstall",
        arguments: { name: toolName },
      });

      if (result.success) {
        spinner.succeed(chalk.green(`✅ ${result.data}`));
      } else {
        spinner.fail(chalk.red(`❌ Uninstallation failed: ${result.error}`));
        console.log(
          boxen(result.error || "", {
            padding: 1,
            margin: 1,
            borderStyle: "round",
            borderColor: "red",
          }),
        );
      }
    } catch (error) {
      spinner.fail(chalk.red("❌ Uninstallation error:"));
      console.error(
        boxen(error instanceof Error ? error.message : String(error), {
          title: "Error",
          padding: 1,
          margin: 1,
          borderColor: "red",
        }),
      );
    }
  }

  private async executeInstall(repo: string): Promise<void> {
    const spinner = ora(chalk.blue(`Installing tool from ${repo}...`)).start();
    try {
      const result = await this.modai.processRequest({
        protocol: "modai",
        tool: "install",
        arguments: { repo },
      });

      if (result.success) {
        spinner.succeed(chalk.green(`✅ ${result.data}`));
      } else {
        spinner.fail(chalk.red(`❌ Installation failed: ${result.error}`));
        console.log(
          boxen(result.error || "", {
            padding: 1,
            margin: 1,
            borderStyle: "round",
            borderColor: "red",
          }),
        );
      }
    } catch (error) {
      spinner.fail(chalk.red("❌ Installation error:"));
      console.error(
        boxen(error instanceof Error ? error.message : String(error), {
          title: "Error",
          padding: 1,
          margin: 1,
          borderColor: "red",
        }),
      );
    }
  }

  private showHelp(): void {
    const helpText = `
${chalk.cyan("📖 Modai CLI Commands:")}
  /help     - Show this help message
  /tools    - List available tools
  /tool <name> <args> - Execute a tool with arguments
  /install <owner>/<repo> - Install a Modai tool from a GitHub repository
  /update [owner/repo] - Check for and install updates for installed Modai tools (or a specific tool)
  /uninstall <name> - Uninstall a Modai tool
  /list     - List all installed Modai tools
  /quit     - Exit the CLI

${chalk.cyan("🔧 Example tool usage:")}
  /tool exec command "ls -la"
  /tool file read path "/etc/hosts"

${chalk.cyan("💬 Or just chat naturally and let the AI use tools for you!")}
`;
    console.log(
      boxen(helpText, {
        padding: 1,
        margin: 1,
        borderStyle: "double",
        borderColor: "cyan",
      }),
    );
  }

  public async showTools(): Promise<void> {
    const tools = this.modai["tools"].list();
    let toolsText = `${chalk.cyan("🔧 Available tools:")}\n`;
    tools.forEach((tool) => {
      toolsText += `\n${chalk.bold(`  - ${tool.name}`)}\n`;
      toolsText += `    Description: ${tool.description}\n`;
      toolsText += `    Example: ${tool.example}\n`;
    });
    console.log(
      boxen(toolsText, {
        padding: 1,
        margin: 1,
        borderStyle: "double",
        borderColor: "cyan",
      }),
    );
  }

  private async promptForConfirmation(message: string): Promise<boolean> {
    const formattedMessage = boxen(message, {
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: "yellow",
      title: chalk.yellow("Tool Execution Confirmation"),
      titleAlignment: "center",
    });

    const { confirmation } = await prompt<{ confirmation: boolean }>({
      type: "confirm",
      name: "confirmation",
      message: formattedMessage,
      initial: true,
    });
    return confirmation;
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
    noUserTools: false,
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
    console.error(
      boxen(
        chalk.red("❌ Failed to start CLI:") +
          (error instanceof Error ? error.message : String(error)),
        { title: "Fatal Error", padding: 1, margin: 1, borderColor: "red" },
      ),
    );
    process.exit(1);
  }
}

main();
