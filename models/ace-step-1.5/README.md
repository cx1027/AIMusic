# ACE-Step 1.5 local model folder

This folder is intended to store **ACE-Step 1.5** model files locally (weights, configs, etc).

Official reference repo: [ace-step/ACE-Step-1.5](https://github.com/ace-step/ACE-Step-1.5)

## Recommended layout

Put your downloaded / converted checkpoints under this directory. A suggested layout is:

```
models/ace-step-1.5/
  checkpoints/
    dit/            # DiT checkpoints (e.g. v15 base/sft/turbo)
    lm/             # optional LLM checkpoints (prompt rewrite / composition)
    vae/            # VAE checkpoints (if separated)
  configs/
  cache/
```

## Backend configuration

The backend reads these environment variables:

- `ACE_STEP_MODEL_DIR`: absolute path to this folder (default: `models/ace-step-1.5`)
- `ACE_STEP_DEVICE`: `mps` (Mac), `cuda`, or `cpu` (default on Mac: `mps`)

## Notes

- Do **NOT** commit model weights to git. Only keep small config files here.


