# Experiments

This directory is for future-facing Vox research that does not belong in the shipped desktop app runtime.

Use it for prototypes, model research, evaluation work, training pipelines, export tooling, and other ideas that may change quickly or get split into their own repositories later.

Nothing in `experiments/` should be treated as production-ready unless a subproject says so explicitly.

## Current projects

- [`vox-model`](./vox-model) is a PyTorch-based model research track for Vox. The goal is to explore what it would look like to build and train a Vox-oriented model, test local export paths such as GGUF, and keep the work clean enough to become a standalone system later.

## Ground rules

- Keep experiments loosely coupled from the Electron app and workspace packages.
- Prefer clear READMEs and self-contained scripts so extraction into another repo stays easy.
- Treat APIs, folder structure, and dependencies here as unstable until they harden.
