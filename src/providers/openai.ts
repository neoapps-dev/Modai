import { ModaiProvider } from "./base.js";

export class OpenAIProvider extends ModaiProvider {
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
    const url =
      this.config.baseUrl || "https://api.openai.com/v1/chat/completions";

    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map((msg) => ({ role: msg.role, content: msg.content })),
      { role: "user", content: message },
    ];

    const response = await this.makeRequest(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
        ...this.config.customHeaders,
      },
      body: JSON.stringify({
        model: this.config.model || "gpt-4",
        messages,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    return data.choices[0].message.content;
  }
}
