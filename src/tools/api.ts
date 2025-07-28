import { ModaiTool, ToolMetadata } from "./base.js";
import fetch from "node-fetch";
import { randomUUID } from "crypto";

export class ApiTool extends ModaiTool {
  metadata: ToolMetadata = {
    name: "api",
    description:
      "Executes advanced REST API calls with full customization, authentication, response parsing, chaining, batch modes, and advanced debugging.",
    example: `api({
      method: 'POST',
      url: 'https://api.example.com/data',
      headers: {Authorization: 'Bearer ...'},
      body: {foo: 'bar'},
      parse: 'json',
      summarize: true,
      chain: [{...}],
      batch: [{...}],
      retries: 3,
      debug: true
    })`,
  };

  async execute(args: Record<string, any>): Promise<any> {
    const {
      method = "GET",
      url,
      headers = {},
      body,
      parse = "auto",
      summarize = false,
      chain = [],
      batch = [],
      retries = 1,
      debug = false,
    } = args;
    if (!url) throw new Error("URL is required for API calls");
    let requestBody;
    if (body && typeof body !== "string") requestBody = JSON.stringify(body);
    else requestBody = body;
    let response, text, output;
    let lastError = null;
    for (let i = 0; i < retries; i++) {
      try {
        response = await fetch(url, {
          method,
          headers,
          body: ["POST", "PUT", "PATCH"].includes(method.toUpperCase())
            ? requestBody
            : undefined,
        });
        text = await response.text();
        if (
          parse === "json" ||
          (parse === "auto" &&
            response.headers.get("content-type")?.includes("json"))
        ) {
          try {
            output = JSON.parse(text);
          } catch {
            output = text;
          }
        } else if (parse === "text" || parse === "auto") {
          output = text;
        } else if (parse === "buffer") {
          output = Buffer.from(text, "utf8");
        } else {
          output = text;
        }
        if (summarize) {
          output = {
            status: response.status,
            ok: response.ok,
            data: output,
          };
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${text}`);
        break;
      } catch (e) {
        lastError = e;
        if (debug) {
          output = {
            error: e instanceof Error ? e.message : String(e),
            attempt: i + 1,
            url,
            method,
            headers,
            body,
          };
        }
        if (i === retries - 1) throw e;
      }
    }
    if (Array.isArray(batch) && batch.length > 0) {
      let batchResults = [];
      for (const req of batch) {
        try {
          const res = await this.execute(req);
          batchResults.push({ success: true, result: res });
        } catch (err) {
          batchResults.push({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      output = batchResults;
    }
    if (Array.isArray(chain) && chain.length > 0) {
      let lastOutput = output;
      for (const step of chain) {
        if (!step.url && step.transform) {
          lastOutput = await step.transform(lastOutput);
        } else {
          step.body = step.body || lastOutput;
          lastOutput = await this.execute(step);
        }
      }
      output = lastOutput;
    }
    return {
      success: true,
      url,
      method,
      headers,
      requestBody,
      output,
      trace: debug ? { response, text } : undefined,
    };
  }
}
