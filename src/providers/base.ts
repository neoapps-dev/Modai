import { ModaiConfig } from "../index.js";

export abstract class ModaiProvider {
  protected config: ModaiConfig;

  constructor(config: ModaiConfig) {
    this.config = config;
  }

  abstract generateResponse(
    message: string,
    systemPrompt: string,
  ): Promise<string>;

  async generateResponseWithHistory(
    message: string,
    systemPrompt: string,
    history: Array<{ role: "user" | "assistant"; content: string }>,
  ): Promise<string> {
    return this.generateResponse(message, systemPrompt);
  }

  protected async makeRequest(
    url: string,
    options: RequestInit,
  ): Promise<Response> {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response;
  }
}
