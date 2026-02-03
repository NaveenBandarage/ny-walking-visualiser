export function getOllamaUrl(): string {
  return process.env.OLLAMA_URL || "http://localhost:11434";
}

export function getOllamaModel(): string {
  return process.env.OLLAMA_MODEL || "gemma3:1b";
}

export function getOllamaEmbedModel(): string {
  return process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
}
