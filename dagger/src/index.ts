import {
  dag,
  Container,
  object,
  func,
  File,
  Secret,
  field,
  Service,
} from "@dagger.io/dagger";
import { PromisePool } from '@supercharge/promise-pool'
import { modelfile } from "./modelfile";
var Table = require("cli-table3");

@object()
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class HfGgufToOllama {
  url?: string;
  quant?: string;
  to?: string;
  
  @field()
  ollamaKey?: Secret;
  
  @field()
  ollamaKeyPub?: File;
  
  @field()
  ollamaHost?: Service;

  /**
   * @param url The huggingface repository to download from, eg `adrienbrault/top-model`
   * @param quant The quant to download, eg `Q4_0`
   * @param to The ollama repository to push to, eg `adrienbrault/top-model`
   * @param ollamaKey eg `file:$HOME/.ollama/id_ed25519`
   * @param ollamaKeyPub eg `~/.ollama/id_ed25519.pub`
   * @param ollamaHost To connect to the local ollama service, use `tcp://localhost:11434`
   */
  constructor(
    url?: string,
    quant?: string,
    to?: string,
    ollamaKey?: Secret,
    ollamaKeyPub?: File,
    ollamaHost?: Service,
  ) {
    if (url) {
      this.url = url;
    }
    if (quant) {
      this.quant = quant;
    }
    if (to) {
      this.to = to;
    }
    if (ollamaKey) {
      this.ollamaKey = ollamaKey;
    }
    if (ollamaKeyPub) {
      this.ollamaKeyPub = ollamaKeyPub;
    }
    if (ollamaHost) {
      this.ollamaHost = ollamaHost;
    }
  }

  urlRequired(): string {
    if (!this.url) {
      throw new Error("--url is required");
    }

    return this.url;
  }

  quantRequired(): string {
    if (!this.quant) {
      throw new Error("--quant is required");
    }

    return this.quant;
  }

  toRequired(): string {
    if (!this.to) {
      throw new Error("--to is required");
    }

    return this.to;
  }

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
  async list(): Promise<string> {
    const repositoryInfo = await this.repositoryInfo();

    const table = new Table({
      head: ["Quant", "Filename"],
    });

    repositoryInfo.ggufFiles.forEach((ggufFile) => {
      table.push([ggufFile.quant, ggufFile.filename]);
    });

    return table.toString();
  }

  @func()
  async repositoryInfo(): Promise<RepositoryInfo> {
    let url = this.urlRequired()
    if (!url.includes("://")) {
      url = `https://huggingface.co/${url}`;
    }
    const directory = dag.git(url).branch("").tree();

    const files = await directory.entries();

    const ggufFiles: GgufFile[] = [];

    for (const file of files) {
      const match = file.match(/[.-](?<quant>i?q[A-Z0-9_]+|f[0-9]{2})(\..+)?\.gguf$/i);
      if (match) {
        ggufFiles.push(new GgufFile(match.groups['quant'], file));
      }
    }

    // Extract org/repo from url
    const repository = url.split("/").slice(-2).join("/");

    return new RepositoryInfo(ggufFiles, url, repository, await directory.file("README.md").contents());
  }

  @func()
  async download(quant?: string): Promise<File> {
    const repositoryInfo = await this.repositoryInfo();
    const ggufFile = repositoryInfo.find(quant || this.quantRequired());

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

  @func()
  async create(quant?: string): Promise<Container> {
    quant = quant || this.quantRequired();

    const [gguf, modelfile] = await Promise.all([
      this.download(quant),
      this.modelfile(quant)
    ]);
    const ggufFileName = await gguf.name();
    
    let ollamaContainer = dag.container().from("ollama/ollama");
    if (this.ollamaHost) {
      ollamaContainer = ollamaContainer
        .withServiceBinding("ollama", this.ollamaHost)
        .withEnvVariable("OLLAMA_HOST", `http://${await this.ollamaHost.endpoint()}`)
      ;
    } else {
      if (!this.ollamaKey || !this.ollamaKeyPub) {
        throw new Error("You must provide either --ollama-host or both --ollama-key and --ollama-key-pub");
      }
      ollamaContainer = ollamaContainer
        .withNewFile(`/root/.ollama/id_ed25519`, {
          contents: await this.ollamaKey.plaintext()
        })
        .withMountedFile(`/root/.ollama/id_ed25519.pub`, this.ollamaKeyPub)

      ollamaContainer = ollamaContainer
        .withServiceBinding(
          "ollama",
          ollamaContainer
            .withExposedPort(11434)
            .asService()
        )
        .withEnvVariable("OLLAMA_HOST", "http://ollama:11434")
    }

    return ollamaContainer
      .withNewFile("/tmp/Modelfile", {
        contents: modelfile,
      })
      .withMountedFile(`/tmp/${ggufFileName}`, gguf)
      .withWorkdir("/tmp")
      .withExec([
        "create",
        `${this.to || this.urlRequired()}:${quant}`,
        "-f",
        "/tmp/Modelfile",
      ])
    ;
  }

  @func()
  async createAll(concurrency: number = 2): Promise<Container[]> {
    const repositoryInfo = await this.repositoryInfo();

    return runPoolGracefully(
      PromisePool
        .withConcurrency(concurrency)
        .for(repositoryInfo.ggufFiles),
      ggufFile => this
        .create(ggufFile.quant)
        .then(result => result.sync()) // Make sure pool detects errors
    );
  }

  @func()
  async push(quant?: string): Promise<string> {
    quant = quant || this.quantRequired();
    const to = this.toRequired();
    let ollamaContainer = await this.create(quant)
    
    const path = `${to}:${quant}`

    return ollamaContainer
      .withExec([
        "push",
        path
      ])
      .sync()
      .then(() => `Pushed ${path} - https://ollama.com/${path}`)
    ;
  }

  @func()
  async pushAll(concurrency: number = 2): Promise<string[]> {
    const repositoryInfo = await this.repositoryInfo();

    return runPoolGracefully(
      PromisePool
        .withConcurrency(concurrency)
        .for(repositoryInfo.ggufFiles),
      ggufFile => this
        .push(ggufFile.quant)
    );
  }

  @func()
  async modelfile(quant?: string): Promise<string> {
    quant = quant || this.quantRequired();

    const repositoryInfo = await this.repositoryInfo();
    const ggufFile = repositoryInfo.find(quant);

    let chatTemplate = undefined
    if (repositoryInfo.readme.includes("<|im_start|>")) {
      chatTemplate = "chatml";
    } else if (repositoryInfo.readme.includes("[/INST]")) {
      chatTemplate = "mistral";
    } else if (repositoryInfo.readme.includes("<|user|>") && repositoryInfo.readme.includes("<|assistant|>")) {
      chatTemplate = "phi";
    }

    return modelfile({
      from: `/tmp/${ggufFile.filename}`,
      chatTemplate,
      license: repositoryInfo.readme.match(/license: (.+)/i)?.[1],
    });
  }

  @func()
  async test(): Promise<string> {
    return dag
      .container()
      .from("oven/bun:1")
      .withMountedDirectory(
        "/app", 
        dag.currentModule().source()
      )
      .withWorkdir("/app")
      .withExec(["bun", "install"])
      .withExec(["bun", "test"])
      .stderr()
    ;
  }
}

@object()
class GgufFile {
  @field()
  quant: string;

  @field()
  filename: string;

  constructor(quant: string, filename: string) {
    this.quant = quant
        .toUpperCase()
        .replace(
            /(q|f)([0-9]+)/i,
            (match, p1, p2) => `${p1.toLowerCase()}${p2}`
        );
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

  find(quant: string): GgufFile {
    const ggufFile = this.ggufFiles.find((ggufFile) => ggufFile.quant.toLowerCase() === quant.toLowerCase());
    
    if (!ggufFile) {
      throw new Error([
        `Quant ${quant} not found in repository.`,
        `Available quants: ${this.ggufFiles.map(ggufFile => ggufFile.quant).join(", ")}`
      ].join(' '));
    }

    return ggufFile;
  }
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

async function runPoolGracefully(pool: PromisePool, processor): Promise<any[]> {
  let errors = []

  const { results } = await pool
    .process(element => processor(element)
      .catch(error => {
        errors.push(error)
      })
    )
  ;

  if (errors.length > 0) {
    throw new Error(`Errors: ${errors.join(", ")}`);
  }

  return results;
}