import { ModaiProvider } from "./base.js";

export class ClaudeProvider extends ModaiProvider {
  async generateResponse(
    message: string,
    systemPrompt: string,
  ): Promise<string> {
    return this.generateResponseWithHistory(message, systemPrompt, []);
  }

  async generateResponseWithHistory(
    message: string,
    systemPrompt: string,
    history: Array<{ role: "user" | "assistant"; content: string }>,
  ): Promise<string> {
    const url = this.config.baseUrl || "https://api.anthropic.com/v1/messages";

    const messages = [
      ...history.map((msg) => ({ role: msg.role, content: msg.content })),
      { role: "user", content: message },
    ];

    const response = await this.makeRequest(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey!,
        "anthropic-version": "2023-06-01",
        ...this.config.customHeaders,
      },
      body: JSON.stringify({
        model: this.config.model || "claude-3-sonnet-20240229",
        max_tokens: 4096,
        system: systemPrompt,
        messages,
      }),
    });

    const data = await response.json();
    return data.content[0].text;
  }
}
