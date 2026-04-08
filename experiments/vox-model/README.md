# vox-model

`vox-model` is a future-looking PyTorch playground for building a Vox-oriented AI model.

The point is not to replace Vox's current local-model stack today. The point is to learn by building: data preparation, model design, training loops, evaluation, export, and local runtime compatibility.

Over time, this can grow into a standalone system if the research becomes useful enough to justify its own repository.

## Direction

- Explore training and fine-tuning workflows in PyTorch.
- Study small-model ideas that fit Vox's local-first product direction.
- Evaluate whether the resulting weights can be exported into local runtime formats such as GGUF for experimentation inside Vox.
- Keep the project structured so it can be lifted out into its own repo later with minimal cleanup.

## Non-goals for now

- Replacing the default production models in Vox.
- Promising a fixed architecture, dataset, or benchmark target yet.
- Coupling training code to the Electron app build.

## Likely contents

- Dataset preparation scripts
- Training and fine-tuning code
- Evaluation scripts and notes
- Conversion or export utilities
- Research docs on model behavior, tool use, and local deployment

## Status

Placeholder project. The README defines the intent before the training stack lands.
