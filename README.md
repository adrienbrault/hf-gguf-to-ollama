Dagger functions to push gguf models from huggingface to ollama.com.

Requirements:
- [Install dagger](https://docs.dagger.io/install)
- [Add your local ollama key to your ollama.com account](https://github.com/ollama/ollama/blob/main/docs/import.md#publishing-your-model-optional--early-alpha)

List all available quantizations:
```console
$ dagger -m github.com/adrienbrault/hf-gguf-to-ollama call list --url NousResearch/Hermes-2-Pro-Mistral-7B-GGUF

┌────────┬─────────────────────────────────────┐
│ Quant  │ Filename                            │
├────────┼─────────────────────────────────────┤
│ Q2_K   │ Hermes-2-Pro-Mistral-7B.Q2_K.gguf   │
├────────┼─────────────────────────────────────┤
│ Q3_K_L │ Hermes-2-Pro-Mistral-7B.Q3_K_L.gguf │
├────────┼─────────────────────────────────────┤
│ Q3_K_M │ Hermes-2-Pro-Mistral-7B.Q3_K_M.gguf │
├────────┼─────────────────────────────────────┤
│ Q3_K_S │ Hermes-2-Pro-Mistral-7B.Q3_K_S.gguf │
├────────┼─────────────────────────────────────┤
│ Q4_0   │ Hermes-2-Pro-Mistral-7B.Q4_0.gguf   │
├────────┼─────────────────────────────────────┤
│ Q4_K_M │ Hermes-2-Pro-Mistral-7B.Q4_K_M.gguf │
├────────┼─────────────────────────────────────┤
│ Q4_K_S │ Hermes-2-Pro-Mistral-7B.Q4_K_S.gguf │
├────────┼─────────────────────────────────────┤
│ Q5_0   │ Hermes-2-Pro-Mistral-7B.Q5_0.gguf   │
├────────┼─────────────────────────────────────┤
│ Q5_K_M │ Hermes-2-Pro-Mistral-7B.Q5_K_M.gguf │
├────────┼─────────────────────────────────────┤
│ Q5_K_S │ Hermes-2-Pro-Mistral-7B.Q5_K_S.gguf │
├────────┼─────────────────────────────────────┤
│ Q6_K   │ Hermes-2-Pro-Mistral-7B.Q6_K.gguf   │
├────────┼─────────────────────────────────────┤
│ Q8_0   │ Hermes-2-Pro-Mistral-7B.Q8_0.gguf   │
└────────┴─────────────────────────────────────┘
```

Print the Modelfile that will be used to create the ollama model:
```console
$ dagger -m github.com/adrienbrault/hf-gguf-to-ollama call modelfile --url afrideva/Tiny-Vicuna-1B-GGUF --quant Q2_K

FROM /tmp/tiny-vicuna-1b.q2_k.gguf

TEMPLATE """{{ if .System }}<|im_start|>system
{{ .System }}<|im_end|>
{{ end }}{{ if .Prompt }}<|im_start|>user
{{ .Prompt }}<|im_end|>
{{ end }}<|im_start|>assistant"""
```

Push all quantizations:
```bash
dagger -m github.com/adrienbrault/hf-gguf-to-ollama \
    call push-all \
    --ollama-key ~/.ollama/id_ed25519 \
    --ollama-key-pub ~/.ollama/id_ed25519.pub \
    --url afrideva/Nous-Capybara-3B-V1.9-GGUF \
    --to adrienbrault/nous-capybara-3b
```


Push a single quantization:
```bash
dagger -m github.com/adrienbrault/hf-gguf-to-ollama \
    call push \
    --ollama-key ~/.ollama/id_ed25519 \
    --ollama-key-pub ~/.ollama/id_ed25519.pub \
    --url afrideva/Nous-Capybara-3B-V1.9-GGUF \
    --quant Q8_0 \
    --to adrienbrault/nous-capybara-3b
```
