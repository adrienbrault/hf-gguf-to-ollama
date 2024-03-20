import { expect, test, describe } from "bun:test";
import { modelfile } from "../src/modelfile";

describe("modelfile", () => {
  test("minimal config", () => {
    const config = { from: "base/image" };
    const expectedOutput = `FROM base/image`;
    expect(modelfile(config)).toBe(expectedOutput);
  });

  test("system and license", () => {
    const config = {
      from: "base/image",
      system: "Linux",
      license: "MIT",
    };
    const expectedOutput = `FROM base/image

SYSTEM """Linux"""

LICENSE """MIT"""`;
    expect(modelfile(config)).toBe(expectedOutput);
  });

  test("chatml template", () => {
    const config = {
      from: "base/image",
      chatTemplate: "chatml",
    };
    const expectedOutput = `FROM base/image

TEMPLATE """{{ if .System }}<|im_start|>system
{{ .System }}<|im_end|>
{{ end }}{{ if .Prompt }}<|im_start|>user
{{ .Prompt }}<|im_end|>
{{ end }}<|im_start|>assistant"""

PARAMETER stop <|im_start|>
PARAMETER stop <|im_end|>`;
    expect(modelfile(config)).toBe(expectedOutput);
  })

    test("mistral template and parameters", () => {
    const config = {
      from: "base/image",
      chatTemplate: "mistral",
      parameters: {
        "key": "value",
        "key2": 2,
        "key3": true,
        "key4": ["value1", "value2"],
      },
      system: "You are a helpful assistant.",
    };
    const expectedOutput = `FROM base/image

TEMPLATE """[INST] {{ .System }} {{ .Prompt }} [/INST]"""

SYSTEM """You are a helpful assistant."""

PARAMETER key value
PARAMETER key2 2
PARAMETER key3 true
PARAMETER key4 value1
PARAMETER key4 value2
PARAMETER stop [INST]
PARAMETER stop [/INST]`;
    expect(modelfile(config)).toBe(expectedOutput);
  })

});