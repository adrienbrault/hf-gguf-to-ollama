import { expect, test, describe, mock } from "bun:test";
import { HfGgufToOllama } from "../src";

describe("HfGgufToOllama", () => {
    test("list", async () => {
        const instance = new HfGgufToOllama();

        instance.repositoryInfo = mock(() => Promise.resolve({
            ggufFiles: [
                { quant: "Q4_0", filename: "model.Q4_0.gguf" },
                { quant: "Q4_K_M", filename: "model.Q4_K_M.gguf" }
            ]
        }));

        const expectedTableString = `┌────────┬───────────────────┐
│ Quant  │ Filename          │
├────────┼───────────────────┤
│ Q4_0   │ model.Q4_0.gguf   │
├────────┼───────────────────┤
│ Q4_K_M │ model.Q4_K_M.gguf │
└────────┴───────────────────┘
`.trim();
        let result = (await instance.list())
            .replace(/[\u001b]/g, "")
            .replace(/\[[^m]+m/g, "")
        ;

        expect(result).toBe(expectedTableString);
    });

    test("repositoryInfo requires url", async () => {
        const instance = new HfGgufToOllama();

        await expect(instance.repositoryInfo()).rejects.toThrow("--url is required");
    })

    test("repositoryInfo", async () => {
        const instance = new HfGgufToOllama("adrienbrault/top-model");

        mock.module("@dagger.io/dagger", () => ({
            dag: {
                git: () => ({
                    branch: () => ({
                        tree: () => ({
                            entries: () => Promise.resolve([
                                "model.Q4_0.gguf",
                                "model.Q4_K_M.gguf",
                                "README.md"
                            ]),
                            file: (filename: string) => {
                                if (filename === "README.md") {
                                    return {
                                        contents: () => Promise.resolve("This is a test README content")
                                    };
                                }
                                throw new Error("File not found");
                            }
                        })
                    })
                })

            }
        }));        
        
        const result = await instance.repositoryInfo();

        expect(result).toEqual({
            ggufFiles: [
                { quant: "Q4_0", filename: "model.Q4_0.gguf" },
                { quant: "Q4_K_M", filename: "model.Q4_K_M.gguf" }
            ],
            url: "https://huggingface.co/adrienbrault/top-model",
            repository: "adrienbrault/top-model",
            readme: "This is a test README content"
        });
    });

    test("modelfile", async () => {
        const instance = new HfGgufToOllama("adrienbrault/top-model");

        instance.repositoryInfo = mock(() => Promise.resolve({
            ggufFiles: [
                { quant: "Q4_0", filename: "model.Q4_0.gguf" },
                { quant: "Q4_K_M", filename: "model.Q4_K_M.gguf" }
            ],
            readme: `
---
license: mit
---
README content`,
            find: (quant: string) => {
                if (quant === "Q4_0") {
                    return { quant: "Q4_0", filename: "model.Q4_0.gguf" };
                }
                throw new Error("Not found");
            }
        }));

        const expectedOutput = `FROM /tmp/model.Q4_0.gguf

LICENSE """mit"""`;
        expect(await instance.modelfile("Q4_0")).toBe(expectedOutput);
    })
});