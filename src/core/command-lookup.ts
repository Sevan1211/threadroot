import { access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

function candidateNames(command: string): string[] {
  if (process.platform !== "win32") {
    return [command];
  }
  if (path.extname(command)) {
    return [command];
  }
  const extensions = (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .filter(Boolean)
    .flatMap((extension) => [extension, extension.toLowerCase()]);
  return extensions.map((extension) => `${command}${extension}`);
}

export async function findExecutable(command: string): Promise<string | undefined> {
  if (path.isAbsolute(command) || command.includes(path.sep) || (path.sep === "\\" && command.includes("/"))) {
    try {
      await access(command, constants.X_OK);
      return command;
    } catch {
      return undefined;
    }
  }

  const paths = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const dir of paths) {
    for (const candidate of candidateNames(command)) {
      const filePath = path.join(dir, candidate);
      try {
        await access(filePath, constants.X_OK);
        return filePath;
      } catch {
        // Keep scanning PATH.
      }
    }
  }
  return undefined;
}

export async function commandExists(command: string): Promise<boolean> {
  return Boolean(await findExecutable(command));
}
