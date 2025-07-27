import { ModaiProvider } from "./base.js";

export class OllamaProvider extends ModaiProvider {
  async generateResponse(
    message: string,
    systemPrompt: string,
  ): Promise<string> {
    const url = `${this.config.baseUrl || "http://localhost:11434"}/api/generate`;

    const response = await this.makeRequest(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.config.customHeaders,
      },
      body: JSON.stringify({
        model: this.config.model || "llama2",
        prompt: `${systemPrompt}\n\nUser: ${message}\nAssistant:`,
        stream: false,
      }),
    });

    const data = await response.json();
    return data.response;
  }
}
