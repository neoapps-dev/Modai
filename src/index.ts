import { ModaiProvider } from "./providers/base.js";
import { OpenAIProvider } from "./providers/openai.js";
import { ClaudeProvider } from "./providers/claude.js";
import { OllamaProvider } from "./providers/ollama.js";
import { CustomProvider } from "./providers/custom.js";
import { ToolRegistry } from "./tools/registry.js";
import { ModaiTool } from "./tools/base.js";
import { glob } from "glob";
import path from "path";
import url from "url";
import { fileURLToPath } from "url";
import os from "os";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
const execPromise = promisify(exec);
import enquirer from "enquirer";
const { prompt } = enquirer;
import chalk from "chalk";
import boxen from "boxen";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export interface ModaiConfig {
  provider: "openai" | "claude" | "ollama" | "custom";
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  customHeaders?: Record<string, string>;
  noUserTools?: boolean;
}

export interface ModaiRequest {
  protocol: string;
  tool: string;
  arguments: Record<string, any>;
}

export interface ModaiResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export class Modai {
  private provider: ModaiProvider;
  private tools: ToolRegistry;
  private messageHistory: Array<{
    role: "user" | "assistant";
    content: string;
  }> = [];
  private readyPromise: Promise<void>;

  constructor(config: ModaiConfig) {
    this.tools = new ToolRegistry();
    this.provider = this.createProvider(config);
    this.readyPromise = this.registerDefaultTools(config.noUserTools ?? false);
  }

  public async waitForReady(): Promise<void> {
    await this.readyPromise;
  }

  private createProvider(config: ModaiConfig): ModaiProvider {
    switch (config.provider) {
      case "openai":
        return new OpenAIProvider(config);
      case "claude":
        return new ClaudeProvider(config);
      case "ollama":
        return new OllamaProvider(config);
      case "custom":
        return new CustomProvider(config);
      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
  }

  private async registerDefaultTools(noUserTools: boolean): Promise<void> {
    if (!noUserTools) {
      const modaiHomeDir = path.join(os.homedir(), ".modai");
      const packageJsonPath = path.join(modaiHomeDir, "package.json");
      if (!fs.existsSync(packageJsonPath)) {
        fs.mkdirSync(modaiHomeDir, { recursive: true });
        try {
          console.log(
            chalk.blue(
              `Initializing user tools directory in ${modaiHomeDir}...`,
            ),
          );
          const defaultPackageJsonContent = `{
  "name": "modai-user-tools",
  "version": "1.0.0",
  "description": "User-defined tools for Modai",
  "main": "index.js",
  "type": "module",
  "scripts": {
    "build": "tsc"
  }
}`;
          fs.writeFileSync(packageJsonPath, defaultPackageJsonContent);
          console.log(chalk.blue("Installing dependencies for user tools..."));
          const { stdout, stderr } = await execPromise(
            "npm i modai-protocol && npm i -D typescript",
            {
              cwd: modaiHomeDir,
            },
          );
          if (stdout) console.log(chalk.gray(stdout));
          if (stderr) console.error(chalk.red(stderr));
          console.log(chalk.green("Dependencies installed successfully."));
        } catch (error) {
          console.error(chalk.red(`Failed to initialize user tools: ${error}`));
        }
      }

      const tsconfigPath = path.join(modaiHomeDir, "tsconfig.json");
      if (!fs.existsSync(tsconfigPath)) {
        const defaultTsconfigContent = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["**/*"]
}`;
        fs.writeFileSync(tsconfigPath, defaultTsconfigContent);
      }

      try {
        console.log(chalk.blue(`Compiling user tools in ${modaiHomeDir}...`));
        const { stdout, stderr } = await execPromise("npm run build", {
          cwd: modaiHomeDir,
        });
        if (stdout) console.log(chalk.gray(stdout));
        if (stderr) console.error(chalk.red(stderr));
        console.log(chalk.green("User tools compiled successfully."));
      } catch (error) {
        console.error(chalk.red(`Failed to compile user tools: ${error}`));
      }

      const userToolsDistDir = path.join(modaiHomeDir, "dist");
      if (fs.existsSync(userToolsDistDir)) {
        const userToolFiles = fs
          .readdirSync(userToolsDistDir)
          .filter((file) => file.endsWith(".js"));

        for (const file of userToolFiles) {
          const modulePath = url.pathToFileURL(
            path.join(userToolsDistDir, file),
          ).href;
          try {
            const module = await import(modulePath);
            for (const exportName in module) {
              const exported = module[exportName];
              if (
                typeof exported === "function" &&
                exported.prototype instanceof ModaiTool
              ) {
                const toolInstance = new exported();
                this.tools.register(toolInstance.metadata.name, toolInstance);
              }
            }
          } catch (error) {
            console.error(
              chalk.red(`Failed to load user tool from ${file}: ${error}`),
            );
          }
        }
      }
    }

    const toolsDir = path.dirname(fileURLToPath(import.meta.url));
    const toolFiles = fs
      .readdirSync(path.join(toolsDir, "tools"))
      .filter(
        (file) =>
          file.endsWith(".js") && file !== "base.js" && file !== "registry.js",
      );

    for (const file of toolFiles) {
      const modulePath = path.join(toolsDir, "tools", file);
      const module = await import(modulePath);
      for (const exportName in module) {
        const exported = module[exportName];
        if (
          typeof exported === "function" &&
          exported.prototype instanceof ModaiTool
        ) {
          const toolInstance = new exported();
          this.tools.register(toolInstance.metadata.name, toolInstance);
        }
      }
    }
  }

  async processRequest(request: ModaiRequest): Promise<ModaiResponse> {
    try {
      if (request.protocol !== "modai") {
        return { success: false, error: "Invalid protocol" };
      }

      const tool = this.tools.get(request.tool);
      if (!tool) {
        return { success: false, error: `Unknown tool: ${request.tool}` };
      }

      const result = await tool.execute(request.arguments);
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async chat(message: string): Promise<string> {
    this.messageHistory.push({ role: "user", content: message });
    const modaiDescription = `Modai is a powerful, extensible AI framework designed to empower large language models (LLMs) with the ability to interact with the real world through tools. It provides a structured protocol for LLMs to request and execute actions, process their results, and integrate them seamlessly into their responses.

Key features of Modai:
- **Tool Execution**: LLMs can call external functions or APIs (tools) by outputting a specific JSON format.
- **Protocol-driven**: Uses a "modai" protocol for tool requests, ensuring clear communication between the LLM and the framework.
- **Contextual Awareness**: Automatically incorporates tool execution results back into the conversation context for more informed responses.
- **Extensible**: Easily integrate new tools and providers to expand the LLM's capabilities.

When you need to use a tool, respond with a JSON object in this format:
{"protocol":"modai","tool":"TOOL_NAME","arguments":{"param":"value"}}`;

    const systemPrompt = `You are an AI assistant that can execute tools through the Modai protocol.
${modaiDescription}

Available tools:
${this.tools
  .list()
  .map((tool) => `- ${tool.name}: ${tool.description} Example: ${tool.example}`)
  .join("\n")}

After executing a tool, continue your response naturally.`;

    const response = await this.provider.generateResponseWithHistory(
      message,
      systemPrompt,
      this.messageHistory,
    );

    this.messageHistory.push({ role: "assistant", content: response });

    return response;
  }

  async chatWithContext(context: string): Promise<string> {
    const modaiDescription = `Modai is a powerful, extensible AI framework designed to empower large language models (LLMs) with the ability to interact with the real world through tools. It provides a structured protocol for LLMs to request and execute actions, process their results, and integrate them seamlessly into their responses.

Key features of Modai:
- **Tool Execution**: LLMs can call external functions or APIs (tools) by outputting a specific JSON format.
- **Protocol-driven**: Uses a "modai" protocol for tool requests, ensuring clear communication between the LLM and the framework.
- **Contextual Awareness**: Automatically incorporates tool execution results back into the conversation context for more informed responses.
- **Extensible**: Easily integrate new tools and providers to expand the LLM's capabilities.

When you need to use a tool, respond with a JSON object in this format:
{"protocol":"modai","tool":"TOOL_NAME","arguments":{"param":"value"}}`;

    const systemPrompt = `You are an AI assistant that can execute tools through the Modai protocol.
${modaiDescription}

Available tools:
${this.tools
  .list()
  .map((tool) => `- ${tool.name}: ${tool.description} Example: ${tool.example}`)
  .join("\n")}

After executing a tool, continue your response naturally.`;

    const temporaryHistory: Array<{
      role: "user" | "assistant";
      content: string;
    }> = [...this.messageHistory, { role: "user", content: context }];
    const response = await this.provider.generateResponseWithHistory(
      context,
      systemPrompt,
      temporaryHistory,
    );

    this.messageHistory.push({ role: "assistant", content: response });
    return response;
  }

  registerTool(name: string, tool: any): void {
    this.tools.register(name, tool);
  }

  extractAndExecuteTools(response: string): Array<ModaiRequest> {
    const toolRequests = this.parseJsonObjects(response);
    return toolRequests.filter(
      (req) => req.protocol === "modai" && req.tool && req.arguments,
    );
  }

  findToolRequestInResponse(response: string, toolName: string): any {
    const toolObjects = this.parseJsonObjects(response);
    return toolObjects.find((obj) => obj.tool === toolName);
  }

  parseJsonObjects(text: string): any[] {
    const objects: any[] = [];
    let i = 0;
    while (i < text.length) {
      const openBrace = text.indexOf("{", i);
      if (openBrace === -1) break;
      const jsonStr = this.extractJsonObject(text, openBrace);
      if (jsonStr) {
        try {
          const obj = JSON.parse(jsonStr);
          if (obj.protocol === "modai") {
            objects.push(obj);
          }
        } catch (e) {
          const fuzzyObj = this.fuzzyJsonParse(jsonStr);
          if (fuzzyObj && fuzzyObj.protocol === "modai") {
            objects.push(fuzzyObj);
          }
        }
        i = openBrace + jsonStr.length;
      } else {
        i = openBrace + 1;
      }
    }

    return objects;
  }

  cleanToolsFromResponse(response: string): string {
    let cleaned = response;
    let startIndex = 0;
    while (true) {
      const openBrace = cleaned.indexOf("{", startIndex);
      if (openBrace === -1) break;

      const jsonStr = this.extractJsonObject(cleaned, openBrace);
      if (jsonStr) {
        try {
          const obj = JSON.parse(jsonStr);
          if (obj.protocol === "modai") {
            cleaned =
              cleaned.substring(0, openBrace) +
              cleaned.substring(openBrace + jsonStr.length);
            startIndex = openBrace;
            continue;
          }
        } catch (e) {
          const fuzzyObj = this.fuzzyJsonParse(jsonStr);
          if (fuzzyObj && fuzzyObj.protocol === "modai") {
            cleaned =
              cleaned.substring(0, openBrace) +
              cleaned.substring(openBrace + jsonStr.length);
            startIndex = openBrace;
            continue;
          }
        }
      }
      startIndex = openBrace + 1;
    }

    return cleaned
      .replace(/\n+/g, "\n")
      .replace(/^\n|\n$/g, "")
      .trim();
  }

  private extractJsonObject(text: string, startIndex: number): string | null {
    let braceCount = 0;
    let inString = false;
    let escaped = false;
    let i = startIndex;
    while (i < text.length) {
      const char = text[i];
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"' && !escaped) {
        inString = !inString;
      } else if (!inString) {
        if (char === "{") {
          braceCount++;
        } else if (char === "}") {
          braceCount--;
          if (braceCount === 0) {
            return text.substring(startIndex, i + 1);
          }
        }
      }

      i++;
    }

    return null;
  }

  private fuzzyJsonParse(jsonStr: string): any | null {
    try {
      let cleaned = jsonStr
        .replace(/\\{/g, "{")
        .replace(/\\}/g, "}")
        .replace(/\\"/g, '"');
      const obj = JSON.parse(cleaned);
      return obj;
    } catch (e) {
      return this.manualKeyValueExtraction(jsonStr);
    }
  }

  private manualKeyValueExtraction(text: string): any | null {
    const obj: any = {};
    const protocolMatch = text.match(/"protocol"\s*:\s*"([^"]+)"/);
    if (protocolMatch) obj.protocol = protocolMatch[1];
    const toolMatch = text.match(/"tool"\s*:\s*"([^"]+)"/);
    if (toolMatch) obj.tool = toolMatch[1];
    const argsMatch = text.match(/"arguments"\s*:\s*({[^}]*})/);
    if (argsMatch) {
      try {
        obj.arguments = JSON.parse(argsMatch[1]);
      } catch (e) {
        obj.arguments = this.parseArgumentsManually(argsMatch[1]);
      }
    }

    return obj.protocol && obj.tool && obj.arguments ? obj : null;
  }

  private parseArgumentsManually(argsStr: string): Record<string, any> {
    const args: Record<string, any> = {};
    const content = argsStr.replace(/[{}]/g, "").trim();
    const pairs = this.splitArguments(content);
    for (const pair of pairs) {
      const colonIndex = pair.indexOf(":");
      if (colonIndex > 0) {
        const key = pair.substring(0, colonIndex).trim().replace(/"/g, "");
        const value = pair
          .substring(colonIndex + 1)
          .trim()
          .replace(/^"|"$/g, "");
        args[key] = value;
      }
    }

    return args;
  }

  private splitArguments(content: string): string[] {
    const parts: string[] = [];
    let current = "";
    let inString = false;
    let escaped = false;
    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      if (escaped) {
        current += char;
        escaped = false;
      } else if (char === "\\") {
        current += char;
        escaped = true;
      } else if (char === '"') {
        current += char;
        inString = !inString;
      } else if (char === "," && !inString) {
        if (current.trim()) {
          parts.push(current.trim());
        }
        current = "";
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      parts.push(current.trim());
    }

    return parts;
  }
}

export * from "./providers/base.js";
export * from "./tools/base.js";
