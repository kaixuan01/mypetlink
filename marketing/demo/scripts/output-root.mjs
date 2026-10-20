/**
 * Where captured video is written.
 *
 * Recordings are large — a four-clip batch is roughly 18 MB and grows with every
 * batch — and this repository lives on an SSD that is better spent on source.
 * So the output root is configuration, resolved in this order:
 *
 *   1. `--output-dir` on the command line, for a one-off.
 *   2. `MYPETLINK_MARKETING_OUTPUT_ROOT`.
 *   3. `marketing/demo/output-root.local`, a single-line file holding a path.
 *      Git-ignored, so each machine sets its own without touching the repo.
 *   4. `marketing/demo/output/`, in-repo, with a warning printed.
 *
 * Nobody's personal path appears in tracked files. A fresh clone with nothing
 * configured still records successfully — it just says where it put the files
 * and how to move them off the source drive.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const demoRoot = path.resolve(scriptDir, "..");

export const LOCAL_CONFIG_FILE = path.join(demoRoot, "output-root.local");
export const ENV_VAR = "MYPETLINK_MARKETING_OUTPUT_ROOT";
export const IN_REPO_FALLBACK = path.join(demoRoot, "output");

/**
 * @param {object} [options]
 * @param {string} [options.explicit] A `--output-dir` value, if one was given.
 * @param {Record<string,string|undefined>} [options.env] Defaults to `process.env`.
 * @param {(file: string) => Promise<string>} [options.readFile] Seam for tests.
 * @returns {Promise<{root: string, source: string, warning?: string}>}
 */
export async function resolveOutputRoot(options = {}) {
  const env = options.env ?? process.env;
  const readFile = options.readFile ?? ((file) => fs.readFile(file, "utf8"));

  if (options.explicit) {
    return { root: path.resolve(options.explicit), source: "--output-dir" };
  }

  const fromEnv = (env[ENV_VAR] ?? "").trim();
  if (fromEnv) {
    return { root: path.resolve(fromEnv), source: ENV_VAR };
  }

  try {
    // First non-empty, non-comment line. A path may contain almost anything, so
    // only "#" at the start of a line is treated as a comment.
    const configured = (await readFile(LOCAL_CONFIG_FILE))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith("#"));

    if (configured) {
      return { root: path.resolve(configured), source: "output-root.local" };
    }
  } catch {
    // Absent or unreadable is the ordinary case on a fresh clone.
  }

  return {
    root: IN_REPO_FALLBACK,
    source: "in-repo fallback",
    warning:
      `No ${ENV_VAR} and no output-root.local, so recordings are going to `
      + `marketing/demo/output inside the repository. That is fine for one batch; `
      + `to keep video off this drive, set ${ENV_VAR} or put a path in `
      + `marketing/demo/output-root.local.`,
  };
}
