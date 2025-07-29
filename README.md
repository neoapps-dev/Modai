# Modai

**Modai** is a modern, TypeScript-powered framework that enables large language models (LLMs) to interact with the real world via extendable "tools"—like running shell commands or reading files. Designed for safety, flexibility, and developer delight.

---

## ✨ Features

- **Multi-provider LLM support:** OpenAI, Claude, Ollama, and custom endpoints.
- **Pluggable, secure tools:** Run system commands, access the filesystem, automate anything.
- **Protocol-driven:** All interactions flow through a predictable JSON protocol for tool use.
- **Easy extension:** Add your own tools or providers with simple base classes.
- **Contextual awareness:** Seamlessly pipes tool results into LLM conversations.
- **Built in TypeScript:** Type safety out-of-the-box, ready for Node.js or via CLI.

---

## 📦 Installation & Setup

### Method 1: NPM (recommended)

```sh
pnpm i -g modai-framework # or npm. also no need for -g (--global) if you want it to be project-level.
```

done. lol..

### Method 2: Clone the repository and install dependencies

```sh
git clone https://github.com/neoapps-dev/modai.git
cd modai
pnpm install   # or: npm install   # choose your package manager
```

Build the TypeScript project:

```sh
pnpm run build  # or: npm run build
```

You can now use Modai via CLI or import it in local projects using:

```typescript
import { Modai } from "./src";
```

(Adjust the `import` path depending on where/how you use the framework.)

---

## 🚀 Quick Start

```typescript
import { Modai } from "./src";

const modai = new Modai({
  provider: "openai", // Also supports "claude", "ollama", "custom"
  apiKey: "YOUR_API_KEY", // Needed for OpenAI/Claude
  model: "gpt-4.1", // Model selection
  // Optionally add: baseUrl, name, etc
});

// Chat with an LLM agent
const response = await modai.chat("List files in the current directory.");

// (Optional) Automatically extract and run any tool requests:
const toolResults = await modai.extractAndExecuteTools(response);

for (const { tool, result } of toolResults) {
  if (result.success) {
    console.log(`> ${tool}:`, result.data);
  }
}

// Or: Directly invoke a tool (scripting/programmatic use)
const execResult = await modai.processRequest({
  protocol: "modai",
  tool: "exec",
  arguments: { command: "ls -la" },
});
console.log(execResult.data.stdout);
```

---

## 🛠️ Core Tools

- **`exec`** — Run system shell commands (with output capture)
- **`file`** — Read, write, and list files/folders
- **`registry`** — Utility for plugin/tool loading

## 🤖 Supported LLM Providers

- **OpenAI** (ChatGPT, GPT-4)
- **Anthropic Claude**
- **Ollama** (local open-source models)
- **Custom**: Point to any compatible LLM API

---

## 🧩 Extending Modai

**To add a new provider:**

- Implement a provider in `src/providers/` extending `BaseProvider`

**To add a new tool:**

- Create a file in `src/tools/`, extending `BaseTool`
- Register it in your config

**Example: Custom Tool**

[this](https://github.com/neoapps-dev/modai-echo). Can be installed via `/install neoapps-dev/modai-echo` or ask the LLM to install it :)

---

## 💡 Example Use Cases

- AI developer agents (automate code, DevOps, builds, refactoring)
- Smart LLM-driven automation on local or cloud systems
- Chatbots with tool-use and access to real data
- Autonomous research, writing, document analysis

---

## 🤝 Contributing

PRs, feedback, and issues welcome!

- Fork, branch, modify, and submit a Pull Request
- Describe your changes, tests appreciated!

---

## 📄 License

MIT License

**Made with ❤️ and TypeScript by [@neoapps-dev](https://github.com/neoapps-dev)**
