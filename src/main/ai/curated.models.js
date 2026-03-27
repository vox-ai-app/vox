export const CURATED_MODELS = [
  {
    id: 'llama-3.2-3b',
    label: 'Llama 3.2 3B',
    description: 'Fast everyday assistant. Great for most tasks.',
    hfRepo: 'bartowski/Llama-3.2-3B-Instruct-GGUF',
    hfFile: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    sizeGB: 2.0,
    isDefault: true
  },
  {
    id: 'phi-3.5-mini',
    label: 'Phi 3.5 Mini',
    description: 'Ultra-fast, very low memory. Best for older Macs.',
    hfRepo: 'bartowski/Phi-3.5-mini-instruct-GGUF',
    hfFile: 'Phi-3.5-mini-instruct-Q4_K_M.gguf',
    sizeGB: 2.2,
    isDefault: false
  },
  {
    id: 'mistral-7b',
    label: 'Mistral 7B',
    description: 'Balanced quality and speed. Strong reasoning.',
    hfRepo: 'bartowski/Mistral-7B-Instruct-v0.3-GGUF',
    hfFile: 'Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
    sizeGB: 4.1,
    isDefault: false
  },
  {
    id: 'llama-3.1-8b',
    label: 'Llama 3.1 8B',
    description: 'Highest quality. Needs 8GB+ RAM.',
    hfRepo: 'bartowski/Meta-Llama-3.1-8B-Instruct-GGUF',
    hfFile: 'Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
    sizeGB: 4.7,
    isDefault: false
  }
]

export const DEFAULT_MODEL = CURATED_MODELS.find((m) => m.isDefault)
