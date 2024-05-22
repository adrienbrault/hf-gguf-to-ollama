type ModelfileConfig = {
  from: string;
  license?: string;
  chatTemplate?: string | "chatml" | "mistral";
  system?: string;
  parameters?: Record<string, string | number | boolean | (string | number | boolean)[]>;
};
export function modelfile(config: ModelfileConfig): string {
  let parts = [`FROM ${config.from}`];
  let parameters = {
    ...config.parameters,
  };

  if (config.chatTemplate) {
    let chatTemplate = config.chatTemplate;
    if (chatTemplate === "chatml") {
      chatTemplate = [
        `{{ if .System }}<|im_start|>system`,
        `{{ .System }}<|im_end|>`,
        `{{ end }}{{ if .Prompt }}<|im_start|>user`,
        `{{ .Prompt }}<|im_end|>`,
        `{{ end }}<|im_start|>assistant`,
      ].join("\n");
      parameters["stop"] = ["<|im_start|>", "<|im_end|>"];
    }
    if (chatTemplate === "mistral") {
      chatTemplate = `[INST] {{ .System }} {{ .Prompt }} [/INST]`;
      parameters["stop"] = ["[INST]", "[/INST]"];
    }
    if (chatTemplate === "phi") {
      chatTemplate = `{{ if .System }}<|system|>
{{ .System }}<|end|>
{{ end }}{{ if .Prompt }}<|user|>
{{ .Prompt }}<|end|>
{{ end }}<|assistant|>
{{ .Response }}<|end|>`;
    }

    parts.push(`TEMPLATE """${chatTemplate}"""`);
  }

  if (config.system) {
    parts.push(`SYSTEM """${config.system}"""`);
  }

  if (config.license) {
    parts.push(`LICENSE """${config.license}"""`);
  }

  parts.push(
    Object.entries(parameters).flatMap(([key, value]) => {
      if (!Array.isArray(value)) {
        return [`PARAMETER ${key} ${value}`];
      }

      return value.map((value) => `PARAMETER ${key} ${value}`);
    }).join("\n")
  );

  return parts.join("\n\n").trim();
}
