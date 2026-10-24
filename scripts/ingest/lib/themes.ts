// The six connected themes of the atlas. `search` is an OpenAlex title-and-abstract search
// (Boolean operators allowed); `topicSearch` resolves the theme to OpenAlex topic ids for the record
// in data/themes.json. CS themes are kept inside the Computer Science field to avoid homonyms
// ("transformer" in power engineering, "graph" in chemistry).
export type Theme = {
  key: string;
  name: string;
  search: string;
  topicSearch: string[];
  csOnly: boolean;
  classics: number;
  recent: number;
};

export const THEMES: Theme[] = [
  {
    key: "snn",
    name: "Spiking neural networks and neuromorphic computing",
    search: '"spiking neural network" OR "spiking neural networks" OR neuromorphic',
    topicSearch: ["spiking neural network", "neuromorphic"],
    csOnly: false,
    classics: 500,
    recent: 400,
  },
  {
    key: "llm",
    name: "Transformers, large language models and retrieval-augmented generation",
    search:
      '"large language model" OR "large language models" OR "retrieval-augmented" OR "self-attention" OR "pre-trained language model"',
    topicSearch: ["natural language processing", "language model", "transformer"],
    csOnly: true,
    classics: 600,
    recent: 400,
  },
  {
    key: "gnn",
    name: "Graph neural networks",
    search:
      '"graph neural network" OR "graph neural networks" OR "graph convolutional network" OR "graph attention network"',
    topicSearch: ["graph neural network"],
    csOnly: true,
    classics: 500,
    recent: 300,
  },
  {
    key: "cv",
    name: "Computer vision benchmarks",
    search: '"object detection" OR "image classification" OR "semantic segmentation" OR "vision transformer"',
    topicSearch: ["object detection", "image classification"],
    csOnly: true,
    classics: 500,
    recent: 300,
  },
  {
    key: "clinical",
    name: "Clinical machine learning",
    search:
      '("machine learning" OR "deep learning") AND ("electronic health records" OR "intensive care" OR MIMIC OR "clinical prediction")',
    topicSearch: ["electronic health records machine learning", "clinical prediction"],
    csOnly: false,
    classics: 450,
    recent: 250,
  },
  {
    key: "rl",
    name: "Reinforcement learning",
    search: '"reinforcement learning"',
    topicSearch: ["reinforcement learning"],
    csOnly: true,
    classics: 500,
    recent: 300,
  },
];

export const CS_FIELD_ID = "fields/17";
export const FROM_YEAR = 2012;
export const RECENT_FROM_YEAR = 2023;
