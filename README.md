Dagger functions to import Hugging Face GGUF models into a local ollama instance and optionally push them to ollama.com.

Requirements:
- [Install dagger](https://docs.dagger.io/install)
- To push to ollama.com, [add your local ollama key to your ollama.com account](https://github.com/ollama/ollama/blob/main/docs/import.md#publishing-your-model-optional--early-alpha)

List available quantizations:
```console
$ dagger -m github.com/adrienbrault/hf-gguf-to-ollama \
    --url NousResearch/Hermes-2-Pro-Mistral-7B-GGUF call list

┌────────┬─────────────────────────────────────┐
│ Quant  │ Filename                            │
├────────┼─────────────────────────────────────┤
│ Q2_K   │ Hermes-2-Pro-Mistral-7B.Q2_K.gguf   │
├────────┼─────────────────────────────────────┤
│ Q3_K_L │ Hermes-2-Pro-Mistral-7B.Q3_K_L.gguf │
├────────┼─────────────────────────────────────┤
...
├────────┼─────────────────────────────────────┤
│ Q8_0   │ Hermes-2-Pro-Mistral-7B.Q8_0.gguf   │
└────────┴─────────────────────────────────────┘
```

Print the Modelfile that will be used to create the ollama model:
```console
$ dagger -m github.com/adrienbrault/hf-gguf-to-ollama \
    --url afrideva/Tiny-Vicuna-1B-GGUF \
    --quant Q2_K \
    call modelfile

FROM /tmp/tiny-vicuna-1b.q2_k.gguf

TEMPLATE """{{ if .System }}<|im_start|>system
{{ .System }}<|im_end|>
{{ end }}{{ if .Prompt }}<|im_start|>user
{{ .Prompt }}<|im_end|>
{{ end }}<|im_start|>assistant"""
```

To import a single GGUF in your local ollama:
```console
$ dagger -m github.com/adrienbrault/hf-gguf-to-ollama \
    --ollama-host tcp://localhost:11434 \
    --url Qwen/Qwen1.5-0.5B-Chat-GGUF \
    --quant Q2_K \
    call create stderr

transferring model data
creating model layer
using already created layer sha256:dafa51a44e4e9e3a96be7ad9232e3cc5bf819f90cc9b9f5ac5a848886977ecc1
writing layer sha256:d9641bd67a6c8a551af0c690c9e0be690b1b9bfa8386f2125a113c4e6b2a0cc9
writing manifest
success

$ ollama list | grep Qwen

Qwen/Qwen1.5-0.5B-Chat-GGUF:Q2_K                  	e343adceeb03	298 MB	7 seconds ago
```

To import all GGUFs in your local ollama:
```console
$ dagger -m github.com/adrienbrault/hf-gguf-to-ollama \
    --ollama-host tcp://localhost:11434 \
    --url Qwen/Qwen1.5-0.5B-Chat-GGUF \
    call create-all stderr

transferring model data
creating model layer
using already created layer sha256:dafa51a44e4e9e3a96be7ad9232e3cc5bf819f90cc9b9f5ac5a848886977ecc1
writing layer sha256:d9641bd67a6c8a551af0c690c9e0be690b1b9bfa8386f2125a113c4e6b2a0cc9
writing manifest
success

transferring model data
...

$ ollama list | grep Qwen

Qwen/Qwen1.5-0.5B-Chat-GGUF:Q2_K                  	e343adceeb03	298 MB	About a minute ago	
Qwen/Qwen1.5-0.5B-Chat-GGUF:Q3_K_M                	ce0eae8b5dcc	349 MB	About a minute ago	
...  	
Qwen/Qwen1.5-0.5B-Chat-GGUF:Q8_0                  	69c9fb3fb9dc	664 MB	29 seconds ago
```

To push a single GGUF to ollama.com:
```console
$ dagger -m github.com/adrienbrault/hf-gguf-to-ollama \
    --ollama-host tcp://localhost:11434 \
    --url brittlewis12/Qwen1.5-0.5B-OpenHermes-2.5-GGUF \
    --to adrienbrault/qwen1.5-0.5b-openhermes-2.5 \
    --quant Q8_0 \
    call push

Pushed adrienbrault/qwen1.5-0.5b-openhermes-2.5:Q8_0 - https://ollama.com/adrienbrault/qwen1.5-0.5b-openhermes-2.5:Q8_0
```

Push all quantizations:
```console
$ dagger -m github.com/adrienbrault/hf-gguf-to-ollama \
    --ollama-host tcp://localhost:11434 \
    --url brittlewis12/Qwen1.5-0.5B-OpenHermes-2.5-GGUF \
    --to adrienbrault/qwen1.5-0.5b-openhermes-2.5 \
    call push-all

● HfGgufToOllama.pushAll(concurrency: 2): [String!]! 59.1s
  ● exec tsx --no-deprecation --tsconfig /src/dagger/tsconfig.json /src/dagger/src/__dagger.entrypoint.ts 59.1s
  ● Container.sync: ContainerID! 29.6s
    ● exec /bin/ollama push adrienbrault/qwen1.5-0.5b-openhermes-2.5:Q3_K_M 26.8s
    ┃ retrieving manifest
    ┃ pushing cf8902e5b199... 100% ▕████████████████▏ 349 MB
    ┃ pushing fa8832888b07... 100% ▕████████████████▏  155 B
    ┃ pushing f02dd72bb242... 100% ▕████████████████▏   59 B
    ┃ pushing 87d0ce112de3... 100% ▕████████████████▏  413 B
  ● Container.sync: ContainerID! 20.5s
    ● exec /bin/ollama push adrienbrault/qwen1.5-0.5b-openhermes-2.5:Q3_K_S 17.7s
    ┃ retrieving manifest
    ┃ pushing ec1967e81a6e... 100% ▕████████████████▏ 333 MB

...

Pushed adrienbrault/qwen1.5-0.5b-openhermes-2.5:Q3_K_L - https://ollama.com/adrienbrault/qwen1.5-0.5b-openhermes-2.5:Q3_K_L
Pushed adrienbrault/qwen1.5-0.5b-openhermes-2.5:Q2_K - https://ollama.com/adrienbrault/qwen1.5-0.5b-openhermes-2.5:Q2_K
...
Pushed adrienbrault/qwen1.5-0.5b-openhermes-2.5:Q6_K - https://ollama.com/adrienbrault/qwen1.5-0.5b-openhermes-2.5:Q6_K
```

If you want to use an ephemeral ollama daemon instead, replace `--ollama-host tcp://localhost:11434` with:
```bash
--ollama-key file:$HOME/.ollama/id_ed25519 --ollama-key-pub ~/.ollama/id_ed25519.pub
```

To run tests:
```console
$ dagger develop
$ cd dagger
$ bun test

bun test v1.0.33 (9e91e137)

test/index.test.ts:
(pass) HfGgufToOllama > list [8.09ms]
(pass) HfGgufToOllama > repositoryInfo requires url [0.29ms]
...
```
