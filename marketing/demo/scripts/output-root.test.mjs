import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { ENV_VAR, IN_REPO_FALLBACK, resolveOutputRoot } from "./output-root.mjs";

const missingFile = () => Promise.reject(new Error("ENOENT"));
const fileSaying = (contents) => () => Promise.resolve(contents);

test("an explicit --output-dir wins over everything", async () => {
  const resolved = await resolveOutputRoot({
    explicit: "D:\\one-off",
    env: { [ENV_VAR]: "D:\\from-env" },
    readFile: fileSaying("D:\\from-file"),
  });

  assert.equal(resolved.root, path.resolve("D:\\one-off"));
  assert.equal(resolved.source, "--output-dir");
  assert.equal(resolved.warning, undefined);
});

test("the environment variable wins over the local file", async () => {
  const resolved = await resolveOutputRoot({
    env: { [ENV_VAR]: "D:\\Project\\MyPetLink\\Marketing\\Captures" },
    readFile: fileSaying("D:\\somewhere-else"),
  });

  assert.equal(resolved.root, path.resolve("D:\\Project\\MyPetLink\\Marketing\\Captures"));
  assert.equal(resolved.source, ENV_VAR);
});

test("an empty or whitespace environment variable is ignored, not obeyed", async () => {
  // An exported-but-blank variable is a common shell accident. Treating it as a
  // real value would resolve to the current working directory.
  const resolved = await resolveOutputRoot({
    env: { [ENV_VAR]: "   " },
    readFile: fileSaying("D:\\from-file"),
  });

  assert.equal(resolved.source, "output-root.local");
});

test("the local file supplies the path when no variable is set", async () => {
  const resolved = await resolveOutputRoot({
    env: {},
    readFile: fileSaying("D:\\Project\\MyPetLink\\Marketing\\Captures\n"),
  });

  assert.equal(resolved.root, path.resolve("D:\\Project\\MyPetLink\\Marketing\\Captures"));
  assert.equal(resolved.source, "output-root.local");
  assert.equal(resolved.warning, undefined);
});

test("comments and blank lines in the local file are skipped", async () => {
  const resolved = await resolveOutputRoot({
    env: {},
    readFile: fileSaying("# where video goes\n\n   \nD:\\Captures\n"),
  });

  assert.equal(resolved.root, path.resolve("D:\\Captures"));
});

test("falls back into the repository, and says so, when nothing is configured", async () => {
  // A fresh clone must still record. It just has to be loud about where the
  // files went, so nobody fills their source drive without noticing.
  const resolved = await resolveOutputRoot({ env: {}, readFile: missingFile });

  assert.equal(resolved.root, IN_REPO_FALLBACK);
  assert.equal(resolved.source, "in-repo fallback");
  assert.match(resolved.warning, /marketing\/demo\/output/);
  assert.match(resolved.warning, new RegExp(ENV_VAR));
});

test("a local file containing only comments falls back too", async () => {
  const resolved = await resolveOutputRoot({
    env: {},
    readFile: fileSaying("# not configured yet\n"),
  });

  assert.equal(resolved.root, IN_REPO_FALLBACK);
  assert.ok(resolved.warning);
});

test("no personal path is baked into the module", async () => {
  // The fallback must be repository-relative. A developer's own drive letter
  // belongs in an ignored file or the environment, never in tracked source.
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("./output-root.mjs", import.meta.url), "utf8"),
  );

  assert.doesNotMatch(source, /[A-Z]:\\\\/);
  assert.ok(IN_REPO_FALLBACK.endsWith(path.join("marketing", "demo", "output")));
});
