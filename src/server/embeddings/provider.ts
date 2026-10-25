import "server-only";

import { env } from "@/server/env";

// Embedding providers. Both produce EmbeddingGemma vectors (768 dimensions, unit length), so an index
// built with one can be queried with the other; EmbeddingMeta in the graph records which model built it.
//   ollama        — local Ollama on the Apple GPU (default)
//   transformers  — Transformers.js with the ONNX build, on CPU (fallback; no daemon needed)

export const EMBEDDING_DIMENSIONS = 768;

// EmbeddingGemma's task prompts: documents and queries are embedded with different prefixes.
export const documentText = (title: string, abstract: string | null) =>
  `title: ${title} | text: ${abstract ?? ""}`.trim();
export const queryText = (q: string) => `task: search result | query: ${q}`;

export type EmbeddingProvider = {
  name: "ollama" | "transformers";
  model: string;
  embed(texts: string[]): Promise<number[][]>;
  unload(): Promise<void>;
};

function ollamaProvider(): EmbeddingProvider {
  const { OLLAMA_URL, EMBEDDING_MODEL } = env();
  const call = async (input: string[], keepAlive: string | number) => {
    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input, keep_alive: keepAlive }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`Ollama embed failed: ${res.status} ${await res.text()}`);
    return ((await res.json()) as { embeddings: number[][] }).embeddings;
  };
  return {
    name: "ollama",
    model: EMBEDDING_MODEL,
    embed: (texts) => call(texts, "5m"),
    // keep_alive: 0 unloads the model so it stops holding GPU memory after a batch job.
    unload: async () => {
      await call([""], 0).catch(() => undefined);
    },
  };
}

type TransformersModel = {
  tokenizer: (texts: string[], opts: { padding: boolean; truncation: boolean }) => Promise<unknown> | unknown;
  model: (inputs: unknown) => Promise<{ sentence_embedding: { tolist(): number[][] } }>;
};
let transformersModel: Promise<TransformersModel> | undefined;

function transformersProvider(): EmbeddingProvider {
  const modelId = "onnx-community/embeddinggemma-300m-ONNX";
  const load = async (): Promise<TransformersModel> => {
    const { AutoModel, AutoTokenizer } = await import("@huggingface/transformers");
    const tokenizer = await AutoTokenizer.from_pretrained(modelId);
    const model = await AutoModel.from_pretrained(modelId, { dtype: "q8" });
    return {
      tokenizer: (texts, opts) => tokenizer(texts, opts),
      model: (inputs) =>
        model(inputs as Record<string, unknown>) as Promise<{ sentence_embedding: { tolist(): number[][] } }>,
    };
  };
  return {
    name: "transformers",
    model: "embeddinggemma",
    embed: async (texts) => {
      transformersModel ??= load();
      const m = await transformersModel;
      const inputs = await m.tokenizer(texts, { padding: true, truncation: true });
      const { sentence_embedding } = await m.model(inputs);
      return sentence_embedding.tolist();
    },
    unload: async () => {
      transformersModel = undefined;
    },
  };
}

export function embeddingProvider(): EmbeddingProvider {
  return env().EMBEDDINGS_PROVIDER === "transformers" ? transformersProvider() : ollamaProvider();
}

export async function embedQuery(q: string): Promise<number[]> {
  const [v] = await embeddingProvider().embed([queryText(q)]);
  return v;
}
