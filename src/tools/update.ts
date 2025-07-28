import { ModaiTool, ToolMetadata } from "./base.js";
import { Octokit } from "octokit";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import * as tar from "tar";
import { exec } from "child_process";
import { promisify } from "util";
const execPromise = promisify(exec);

interface ModaiToolConfig {
  name: string;
  version: string;
  owner: string;
  repo: string;
  files: string[];
  dirs: string[];
  npmDeps: string[];
}

export class UpdateTool extends ModaiTool {
  metadata: ToolMetadata = {
    name: "update",
    description:
      "Checks for updates for installed Modai tools and updates them.",
    example: "modai update",
    parameters: {
      type: "object",
      properties: {
        toolName: {
          type: "string",
          description:
            "Optional: The name of the tool to update. If omitted, all installed tools will be checked for updates.",
        },
      },
      required: [],
    },
  };

  async installNpmDependencies(deps: string[], toolDir: string): Promise<void> {
    if (deps.length === 0) return;
    const installCmd = `npm install ${deps.join(" ")}`;
    try {
      const { stdout, stderr } = await execPromise(installCmd, {
        cwd: toolDir,
      });
      if (process.env.DEBUG === "1") {
        console.log(`\n[ToolUpdater] npm install stdout:\n${stdout}`);
        if (stderr)
          console.warn(`\n[ToolUpdater] npm install stderr:\n${stderr}`);
      }
    } catch (error) {
      console.error(`\n[ToolUpdater] npm install failed:`, error);
      throw error;
    }
  }

  protected async _execute(args: Record<string, any>): Promise<any> {
    const modaiDir = path.join(os.homedir(), ".modai");
    let toolsToUpdate: ModaiToolConfig[] = [];

    if (args.toolName) {
      try {
        const content = await fs.readFile(
          path.join(modaiDir, `${args.toolName}.tool.json`),
          "utf8",
        );
        toolsToUpdate.push(JSON.parse(content));
      } catch (error: any) {
        if (error.code === "ENOENT") {
          return `Tool '${args.toolName}' not found.`;
        }
        throw new Error(
          `Failed to read tool config for ${args.toolName}: ${error.message}`,
        );
      }
    } else {
      try {
        const files = await fs.readdir(modaiDir);
        for (const file of files) {
          if (file.endsWith(".tool.json")) {
            const content = await fs.readFile(
              path.join(modaiDir, file),
              "utf8",
            );
            toolsToUpdate.push(JSON.parse(content));
          }
        }
      } catch (error: any) {
        if (error.code === "ENOENT") {
          return "No Modai tools found to update.";
        }
        throw new Error(`Failed to read installed tools: ${error.message}`);
      }
    }

    if (toolsToUpdate.length === 0) {
      return "No Modai tools found to update.";
    }

    const octokit = new Octokit();
    let updatedTools: string[] = [];
    let noUpdates: string[] = [];
    let failedUpdates: string[] = [];

    for (const toolConfig of toolsToUpdate) {
      try {
        const { owner, repo } = toolConfig;

        const { data: repoData } = await octokit.rest.repos.get({
          owner,
          repo,
        });
        const defaultBranch = repoData.default_branch;
        let remoteToolJsonContent: any;

        try {
          const { data } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: "modai.tool.json",
            ref: defaultBranch,
          });
          remoteToolJsonContent = data;
        } catch (error: any) {
          if (error.status === 404) {
            console.warn(
              `modai.tool.json not found for ${toolConfig.name}. Skipping update.`,
            );
            continue;
          }
          throw error;
        }

        const decodedContent = Buffer.from(
          remoteToolJsonContent.content,
          "base64",
        ).toString("utf8");
        const remoteToolConfig: ModaiToolConfig = JSON.parse(decodedContent);

        if (remoteToolConfig.version > toolConfig.version) {
          console.log(
            `Updating ${toolConfig.name} from v${toolConfig.version} to v${remoteToolConfig.version}...`,
          );

          const { url: tarballUrl } =
            await octokit.rest.repos.downloadTarballArchive({
              owner,
              repo,
              ref: defaultBranch,
            });

          const tempTarballPath = path.join(
            os.tmpdir(),
            `${repo}-${defaultBranch}.tar.gz`,
          );
          const downloadCommand = `curl -L "${tarballUrl}" -o "${tempTarballPath}"`;
          try {
            await execPromise(downloadCommand);
          } catch (execError: any) {
            console.error(
              `\nError during tarball download for ${toolConfig.name}: ${execError.message}`,
            );
            if (execError.stderr) console.error(`stderr: ${execError.stderr}`);
            throw new Error(
              `Failed to download tarball for ${toolConfig.name}: ${execError.message}`,
            );
          }

          await tar.extract({
            file: tempTarballPath,
            cwd: modaiDir,
            strip: 1,
            filter: (path, stat) => {
              const relativePath = path.split("/").slice(1).join("/");
              if (remoteToolConfig.files.includes(relativePath)) return true;
              if (
                remoteToolConfig.dirs.some(
                  (dir) =>
                    relativePath.startsWith(dir + "/") || relativePath === dir,
                )
              )
                return true;
              return false;
            },
          });

          await fs.unlink(tempTarballPath);
          await fs.writeFile(
            path.join(modaiDir, `${toolConfig.name}.tool.json`),
            decodedContent,
          ); // Update local config
          if (remoteToolConfig.npmDeps) {
            await this.installNpmDependencies(
              remoteToolConfig.npmDeps,
              modaiDir,
            );
          }
          updatedTools.push(toolConfig.name);
        } else {
          noUpdates.push(toolConfig.name);
        }
      } catch (error: any) {
        console.error(`Failed to update ${toolConfig.name}: ${error.message}`);
        failedUpdates.push(toolConfig.name);
      }
    }

    let result = "";
    if (updatedTools.length > 0) {
      result += `Successfully updated: ${updatedTools.join(", ")}. `;
    }
    if (noUpdates.length > 0) {
      result += `No updates for: ${noUpdates.join(", ")}. `;
    }
    if (failedUpdates.length > 0) {
      result += `Failed to update: ${failedUpdates.join(", ")}. `;
    }
    if (result === "") {
      return "No Modai tools found or processed.";
    }
    return result.trim();
  }
}
