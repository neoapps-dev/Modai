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
  files: string[];
  dirs: string[];
}

export class InstallTool extends ModaiTool {
  metadata: ToolMetadata = {
    name: "install",
    description: "Installs a Modai tool from a GitHub repository.",
    example: "modai install githubusername/repo",
    parameters: {
      type: "object",
      properties: {
        repo: {
          type: "string",
          description: 'The GitHub repository in the format "owner/repo".',
        },
      },
      required: ["repo"],
    },
  };

  protected async _execute(args: Record<string, any>): Promise<any> {
    this.validateArgs(args, this.metadata.parameters.required);
    const [owner, repo] = args.repo.split("/");

    if (!owner || !repo) {
      throw new Error('Invalid repository format. Please use "owner/repo".');
    }

    const octokit = new Octokit();
    const modaiDir = path.join(os.homedir(), ".modai");
    await fs.mkdir(modaiDir, { recursive: true });

    try {
      const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
      const defaultBranch = repoData.default_branch;
      let modaiToolJsonContent: any;
      try {
        const { data } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: "modai.tool.json",
          ref: defaultBranch,
        });
        modaiToolJsonContent = data;
      } catch (error: any) {
        if (error.status === 404) {
          throw new Error(
            `Repository '${owner}/${repo}' not found or 'modai.tool.json' is missing in the root of the default branch.`,
          );
        }
        throw error;
      }

      if (!("content" in modaiToolJsonContent)) {
        throw new Error(
          "This is not a Modai tool repository (modai.tool.json not found).",
        );
      }

      const decodedContent = Buffer.from(
        modaiToolJsonContent.content,
        "base64",
      ).toString("utf8");
      const toolConfig: ModaiToolConfig = JSON.parse(decodedContent);
      const toolConfigFileName = `${toolConfig.name}.tool.json`;
      await fs.writeFile(
        path.join(modaiDir, toolConfigFileName),
        decodedContent,
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
      console.log(`Attempting to download tarball from: ${tarballUrl}`);
      console.log(`Executing command: ${downloadCommand}`);
      try {
        const { stdout, stderr } = await execPromise(downloadCommand);
        if (stdout) console.log(`stdout: ${stdout}`);
        if (stderr) console.error(`stderr: ${stderr}`);
      } catch (execError: any) {
        console.error(`Error during tarball download: ${execError.message}`);
        if (execError.stderr) console.error(`stderr: ${execError.stderr}`);
        throw new Error(`Failed to download tarball: ${execError.message}`);
      }

      await tar.extract({
        file: tempTarballPath,
        cwd: modaiDir,
        strip: 1,
        filter: (path, stat) => {
          const relativePath = path.split("/").slice(1).join("/");
          if (toolConfig.files.includes(relativePath)) return true;
          if (
            toolConfig.dirs.some(
              (dir) =>
                relativePath.startsWith(dir + "/") || relativePath === dir,
            )
          )
            return true;
          return false;
        },
      });

      await fs.unlink(tempTarballPath);
      return `Successfully installed ${toolConfig.name} from ${args.repo}`;
    } catch (error: any) {
      const toolConfigFileName = `${repo.split("/")[1]}.tool.json`;
      try {
        await fs.unlink(path.join(modaiDir, toolConfigFileName));
      } catch (cleanupError) {}
      throw new Error(`Failed to install tool: ${error.message}`);
    }
  }
}
