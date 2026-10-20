import { defineConfig } from "vitest/config";
export default defineConfig({
 root:"C:/Project/MyPetLink",
 resolve:{alias:{"@":"C:/Project/MyPetLink/apps/web/src"}},
 esbuild:{jsx:"automatic"},
 test:{include:["artifacts/consignment-phase1b-final-fixes/codex-rerun/*.test.tsx"]}
});
