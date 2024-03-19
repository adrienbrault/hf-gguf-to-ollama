import {
  dag,
  Container,
  object,
  func,
  File,
  Secret,
  field,
} from "@dagger.io/dagger";
import { PromisePool } from '@supercharge/promise-pool'
var Table = require("cli-table3");

@object()
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class HfGgufToOllama {
  @func()
  hfCli(): Container {
    return dag
      .container()
      .from("python:3.9")
      .withExec(["pip", "install", "huggingface_hub[hf_transfer]"])
      .withExec(["huggingface-cli", "--help"])
      .withEnvVariable("HF_HUB_ENABLE_HF_TRANSFER", "1")
    ;
  }

  @func()
  async list(url: string): Promise<string> {
    const repositoryInfo = await this.repositoryInfo(url);

    const table = new Table({
      head: ["Quant", "Filename"],
    });

    repositoryInfo.ggufFiles.forEach((ggufFile) => {
      table.push([ggufFile.quant, ggufFile.filename]);
    });

    return table.toString();
  }

  @func()
  async repositoryInfo(url: string): Promise<RepositoryInfo> {
    if (!url.includes("://")) {
      url = `https://huggingface.co/${url}`;
    }
    const directory = await dag.git(url).branch("").tree();

    const files = await directory.entries();

    const ggufFiles: GgufFile[] = [];

    for (const file of files) {
      const match = file.match(/(?<quant>i?q[A-Z0-9_]+)\.gguf$/i);
      if (match) {
        ggufFiles.push(new GgufFile(match.groups['quant'], file));
      }
    }

    // Extract org/repo from url
    const repository = url.split("/").slice(-2).join("/");

    return new RepositoryInfo(ggufFiles, url, repository, await directory.file("README.md").contents());
  }

  @func()
  async download(url: string, quant: string): Promise<File> {
    const repositoryInfo = await this.repositoryInfo(url);
    const ggufFile = repositoryInfo.find(quant);

    if (!ggufFile) {
      throw new Error(`Quant ${quant} not found in repository`);
    }

    return this.hfCli()
      .withExec([
        "huggingface-cli",
        "download",
        repositoryInfo.repository,
        ggufFile.filename,
        "--local-dir",
        "/tmp",
      ])
      .file(`/tmp/${ggufFile.filename}`);
  }

  /**
   * @param url The huggingface repository to download from, eg `adrienbrault/top-model`
   * @param quant The quant to download, eg `Q4_0`
   * @param to The ollama repository to push to, eg `adrienbrault/top-model`
   * @param ollamaKey Use file:$HOME/.ollama/id_ed25519
   * @param ollamaKeyPub Use ~/.ollama/id_ed25519.pub
   */
  @func()
  async push(url: string, quant: string, to: string, ollamaKey: Secret, ollamaKeyPub: File): Promise<string> {
    const [gguf, modelfile] = await Promise.all([
      this.download(url, quant),
      this.modelfile(url, quant)
    ]);
    const ggufFileName = await gguf.name();
    const ollamaKeyContents = await ollamaKey.plaintext()

    const ollama = () => 
      dag.container()
        .from("ollama/ollama")
        .withNewFile(`/root/.ollama/id_ed25519`, {
          contents: ollamaKeyContents
        })
        .withMountedFile(`/root/.ollama/id_ed25519.pub`, ollamaKeyPub)
        .withNewFile("/tmp/Modelfile", {
          contents: modelfile,
        })
        .withMountedFile(`/tmp/${ggufFileName}`, gguf)
        .withWorkdir("/tmp")
    ;
    
    return ollama()
      .withServiceBinding(
        "ollama",
        ollama()
          .withExposedPort(11434)
          .asService()
      )
      .withEnvVariable("OLLAMA_HOST", "http://ollama:11434")
      .withExec([
        "create",
        `${to}:${quant}`,
        "-f",
        "/tmp/Modelfile",
      ])
      .withExec([
        "push",
        `${to}:${quant}`
      ])
      .stdout()
    ;
  }

  /**
   * @param url The huggingface repository to download from, eg `adrienbrault/top-model`
   * @param to The ollama repository to push to, eg `adrienbrault/top-model`
   * @param ollamaKey Use file:$HOME/.ollama/id_ed25519
   * @param ollamaKeyPub Use ~/.ollama/id_ed25519.pub
   */
  @func()
  async pushAll(url: string, to: string, ollamaKey: Secret, ollamaKeyPub: File, concurrency: number = 2): Promise<string> {
    const repositoryInfo = await this.repositoryInfo(url);

    const { results, errors } = await PromisePool
      .withConcurrency(concurrency)
      .for(repositoryInfo.ggufFiles)
      .process(async (ggufFile) => {
        return this.push(url, ggufFile.quant, to, ollamaKey, ollamaKeyPub);
      })
    ;

    return results.join("\n");
  }

  @func()
  async modelfile(url: string, quant: string): Promise<string> {
    const repositoryInfo = await this.repositoryInfo(url);
    const ggufFile = repositoryInfo.find(quant);

    if (!ggufFile) {
      throw new Error(`Quant ${quant} not found in repository`);
    }

    let chatTemplate = undefined
    if (repositoryInfo.readme.includes("<|im_start|>")) {
      chatTemplate = "chatml";
    } else if (repositoryInfo.readme.includes("[/INST]")) {
      chatTemplate = "mistral";
    }

    return modelfile({
      from: `/tmp/${ggufFile.filename}`,
      chatTemplate,
    });
  }
}

@object()
class GgufFile {
  @field()
  quant: string;

  @field()
  filename: string;

  constructor(quant: string, filename: string) {
    this.quant = quant.toUpperCase();
    this.filename = filename;
  }
}

@object()
class RepositoryInfo {
  @field()
  ggufFiles: GgufFile[];

  @field()
  url: string;

  @field()
  repository: string;

  @field()
  readme: string;

  constructor(ggufFiles: GgufFile[], url: string, repository: string, readme: string = "") {
    this.ggufFiles = ggufFiles;
    this.url = url;
    this.repository = repository;
    this.readme = readme;
  }

  find(quant: string): GgufFile | undefined {
    return this.ggufFiles.find((ggufFile) => ggufFile.quant === quant.toUpperCase());
  }
}

type ModelfileConfig = {
  from: string;
  license?: string;
  chatTemplate?: string | "chatml" | "mistral";
  system?: string;
  parameters?: Record<string, string | number | boolean | (string | number | boolean)[]>;
};
function modelfile(config: ModelfileConfig): string {
  let parts = [`FROM ${config.from}`];
  let parameters = {
    ...config.parameters,
  };

  if (config.system) {
    parts.push(`SYSTEM """${config.system}"""`);
  }
  if (config.chatTemplate) {
    let chatTemplate = config.chatTemplate;
    if (chatTemplate === "chatml") {
      chatTemplate = [
        `{{ if .System }}<|im_start|>system`,
        `{{ .System }}<|im_end|>`,
        `{{ end }}{{ if .Prompt }}<|im_start|>user`,
        `{{ .Prompt }}<|im_end|>`,
        `{{ end }}<|im_start|>assistant`,
      ].join("\n")
      ;
      parameters["stop"] = ["<|im_start|>", "<|im_end|>"];
    }
    if (chatTemplate === "mistral") {
      chatTemplate = `[INST] {{ .System }} {{ .Prompt }} [/INST]`;
      parameters["stop"] = ["[INST]", "[/INST]"];
    }

    parts.push(`TEMPLATE """${chatTemplate}"""`);
  }
  if (config.license) {
    parts.push(`LICENSE """${config.license}"""`);
  }
  
  for (const [key, value] of Object.entries(parameters)) {
    parts.push(
      (Array.isArray(value) ? value : []).map((v) => `PARAMETER ${key} ${v}`).join("\n")
    );
  }

  return parts.join("\n\n");
}

function ggufTools(): Container {
  return dag.container()
      .from("alpine:3.19")
      .withMountedDirectory(
        "/gguf-tools",
        dag.git("https://github.com/antirez/gguf-tools").branch("").tree()
      )
      .withWorkdir("/gguf-tools")
      .withExec(["apk", "add", "build-base"])
      .withExec(["make", "all"])
      .withEntrypoint(["./gguf-tools"])
    ;
}