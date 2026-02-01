import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
    files: "../out/test/**/*.test.js",
    extensionDevelopmentPath: "..",
    coverage: {
        output: "./coverage",
        reporter: ["text-summary", "text", "html"],
    },
});
