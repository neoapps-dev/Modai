import { ModaiTool, ToolMetadata } from "./base.js";
export class DicingTool extends ModaiTool {
  metadata: ToolMetadata = {
    name: "dicing",
    description:
      "Rolls dice from advanced expressions: e.g., 2d6+1, 3d6+2d4+5. Returns each roll, subtotals, and grand total as stdout.",
    example: "dicing(expression='2d20+5d4-3')",
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "The dice expression to roll (e.g., 2d6+1, 3d6+2d4+5).",
        },
      },
      required: ["expression"],
    },
  };

  protected async _execute(args: Record<string, any>): Promise<any> {
    this.validateArgs(args, ["expression"]);
    const expr = args.expression.replace(/\s+/g, "");
    const dicePattern = /([+-]?\d*d\d+)/g;
    const modPattern = /([+-]?\d+)(?!d)/g;
    const diceParts = expr.match(dicePattern) || [];
    const modifiers =
      (expr.replace(dicePattern, "") || "").match(modPattern) || [];
    let grandTotal = 0;
    const componentResults: any[] = [];
    for (const part of diceParts) {
      const match = /^([+-]?)(\d*)d(\d+)$/i.exec(part);
      if (!match) continue;
      const sign = match[1] === "-" ? -1 : 1;
      const numDice = parseInt(match[2] || "1", 10);
      const numSides = parseInt(match[3], 10);
      if (numDice < 1 || numSides < 2) continue;
      const rolls = Array.from(
        { length: numDice },
        () => Math.floor(Math.random() * numSides) + 1,
      );
      const subtotal = sign * rolls.reduce((a, b) => a + b, 0);
      grandTotal += subtotal;
      componentResults.push({ part, numDice, numSides, rolls, subtotal });
    }

    let modTotal = 0;
    for (const mod of modifiers) {
      modTotal += parseInt(mod, 10);
    }
    grandTotal += modTotal;
    if (diceParts.length === 0 && modifiers.length === 0) {
      return {
        error: "No valid dice or modifiers found in expression.",
        success: false,
      };
    }

    return {
      success: true,
      expression: args.expression,
      dice_components: componentResults,
      modifier: modTotal,
      stdout: grandTotal, // because yes.
    };
  }
}
