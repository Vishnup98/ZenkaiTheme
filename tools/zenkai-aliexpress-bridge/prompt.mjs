import readline from "node:readline";

export class PromptError extends Error {
  constructor(message) {
    super(message);
    this.name = "PromptError";
  }
}

export function readLine(question, { input = process.stdin, output = process.stdout } = {}) {
  return new Promise((resolve) => {
    const interface_ = readline.createInterface({ input, output });
    interface_.question(question, (answer) => {
      interface_.close();
      resolve(answer);
    });
  });
}

export function readHidden(question, { input = process.stdin, output = process.stdout } = {}) {
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    throw new PromptError("This command requires an interactive terminal so sensitive input can be hidden.");
  }

  return new Promise((resolve, reject) => {
    let value = "";
    const wasRaw = Boolean(input.isRaw);
    const wasPaused = input.isPaused();
    input.setEncoding("utf8");
    input.setRawMode(true);
    input.resume();
    output.write(question);

    const finish = (error) => {
      input.off("data", onData);
      input.setRawMode(wasRaw);
      if (wasPaused) input.pause();
      output.write("\n");
      if (error) reject(error);
      else resolve(value);
    };

    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          finish(new PromptError("Input cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          if (value.length > 0) {
            value = [...value].slice(0, -1).join("");
            output.write("\b \b");
          }
          continue;
        }
        if (character < " ") continue;
        value += character;
        output.write("•");
      }
    };

    input.on("data", onData);
  });
}
