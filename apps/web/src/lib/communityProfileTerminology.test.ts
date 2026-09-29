import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * "Community Profile" is the canonical name of the owner's public identity in
 * Community (docs/architecture/product-model.md), and the name the settings,
 * the pet overview and the entry links already used. Eleven strings — the
 * mobile header on My Profile, the Comment and report prompts, the
 * collaborator picker, My Profile's own set-up and switched-off screens —
 * wrote it with a lower-case "profile", so the same feature read as two
 * different things depending on where somebody met it.
 *
 * This reads the source rather than rendering every screen: comments are
 * stripped first, because the rule is about words people see, and code
 * comments may describe the feature however they like.
 */

const src = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

function withoutComments(text: string) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

describe("Community Profile terminology", () => {
  it("never writes the feature's name with a lower-case 'profile'", () => {
    const offenders = sourceFiles(src).flatMap((file) =>
      withoutComments(readFileSync(file, "utf8"))
        .split("\n")
        .filter((line) => line.includes("Community profile"))
        .map((line) => `${relative(src, file)}: ${line.trim()}`)
    );

    expect(offenders).toEqual([]);
  });
});
