import fetch from "node-fetch";
import { ModaiProvider } from "./base.js";
import { ModaiConfig } from "../index.js";

export class CustomProvider extends ModaiProvider {
  constructor(config: ModaiConfig) {
    super(config);
  }

  async generateResponse(
    prompt: string,
    systemPrompt?: string,
  ): Promise<string> {
    const messages = [{ role: "user", content: prompt }];
    if (systemPrompt) {
      messages.unshift({ role: "system", content: systemPrompt });
    }

    const response = await fetch(this.config.baseUrl || "", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
        ...this.config.customHeaders,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: messages,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: any = await response.json();
    return data.choices[0].message.content;
  }

  async generateResponseWithHistory(
    prompt: string,
    systemPrompt: string,
    history: Array<{ role: "user" | "assistant"; content: string }>,
  ): Promise<string> {
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map((h) => ({ role: h.role, content: h.content })),
    ];

    const response = await fetch(this.config.baseUrl || "", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
        ...this.config.customHeaders,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: messages,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: any = await response.json();
    return data.choices[0].message.content;
  }
}
