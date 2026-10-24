// Curated alias dictionaries. Matching is case-sensitive where an alias is an acronym (so "COCO" does
// not match "cocoa") and on word boundaries everywhere, and only the closed lists below can be linked,
// so nothing is invented.

export type DatasetAlias = {
  name: string;
  aliases: string[];
  modality: string;
  domain: string;
  pwcName?: string;
};

export const DATASETS: DatasetAlias[] = [
  // vision
  { name: "ImageNet", aliases: ["ImageNet", "ILSVRC"], modality: "Images", domain: "Computer vision" },
  {
    name: "COCO",
    aliases: ["MS COCO", "MS-COCO", "MSCOCO", "COCO"],
    modality: "Images",
    domain: "Computer vision",
  },
  {
    name: "PASCAL VOC",
    aliases: ["PASCAL VOC", "Pascal VOC", "VOC 2007", "VOC2007", "VOC 2012", "VOC2012"],
    modality: "Images",
    domain: "Computer vision",
  },
  { name: "KITTI", aliases: ["KITTI"], modality: "Images", domain: "Autonomous driving" },
  { name: "Cityscapes", aliases: ["Cityscapes"], modality: "Images", domain: "Autonomous driving" },
  { name: "ADE20K", aliases: ["ADE20K", "ADE20k", "ADE-20K"], modality: "Images", domain: "Computer vision" },
  { name: "CIFAR-10", aliases: ["CIFAR-10", "CIFAR10"], modality: "Images", domain: "Computer vision" },
  { name: "CIFAR-100", aliases: ["CIFAR-100", "CIFAR100"], modality: "Images", domain: "Computer vision" },
  { name: "MNIST", aliases: ["MNIST"], modality: "Images", domain: "Computer vision" },
  {
    name: "Fashion-MNIST",
    aliases: ["Fashion-MNIST", "FashionMNIST"],
    modality: "Images",
    domain: "Computer vision",
  },
  { name: "SVHN", aliases: ["SVHN"], modality: "Images", domain: "Computer vision" },
  { name: "CelebA", aliases: ["CelebA"], modality: "Images", domain: "Computer vision" },
  { name: "LVIS", aliases: ["LVIS"], modality: "Images", domain: "Computer vision" },
  { name: "Visual Genome", aliases: ["Visual Genome"], modality: "Images", domain: "Computer vision" },
  {
    name: "Kinetics",
    aliases: ["Kinetics-400", "Kinetics-600", "Kinetics"],
    modality: "Videos",
    domain: "Computer vision",
  },
  { name: "UCF101", aliases: ["UCF101", "UCF-101"], modality: "Videos", domain: "Computer vision" },
  {
    name: "NTU RGB+D",
    aliases: ["NTU RGB+D", "NTU-RGB+D", "NTU RGB-D"],
    modality: "Videos",
    domain: "Computer vision",
  },
  { name: "DOTA", aliases: ["DOTA"], modality: "Images", domain: "Remote sensing" },
  { name: "VisDrone", aliases: ["VisDrone"], modality: "Images", domain: "Computer vision" },
  // neuromorphic
  { name: "N-MNIST", aliases: ["N-MNIST", "NMNIST"], modality: "Events", domain: "Neuromorphic vision" },
  {
    name: "DVS128 Gesture",
    aliases: ["DVS128 Gesture", "DVS-Gesture", "DVS Gesture", "DVS128"],
    modality: "Events",
    domain: "Neuromorphic vision",
  },
  {
    name: "CIFAR10-DVS",
    aliases: ["CIFAR10-DVS", "CIFAR-10-DVS", "CIFAR10DVS"],
    modality: "Events",
    domain: "Neuromorphic vision",
  },
  {
    name: "N-Caltech101",
    aliases: ["N-Caltech101", "N-Caltech 101"],
    modality: "Events",
    domain: "Neuromorphic vision",
  },
  {
    name: "SHD",
    aliases: ["Spiking Heidelberg Digits", "SHD"],
    modality: "Audio",
    domain: "Neuromorphic audio",
  },
  // language
  { name: "GLUE", aliases: ["GLUE"], modality: "Texts", domain: "Natural language understanding" },
  { name: "SuperGLUE", aliases: ["SuperGLUE"], modality: "Texts", domain: "Natural language understanding" },
  { name: "SQuAD", aliases: ["SQuAD"], modality: "Texts", domain: "Question answering" },
  {
    name: "Natural Questions",
    aliases: ["Natural Questions"],
    modality: "Texts",
    domain: "Question answering",
  },
  { name: "TriviaQA", aliases: ["TriviaQA"], modality: "Texts", domain: "Question answering" },
  { name: "HotpotQA", aliases: ["HotpotQA"], modality: "Texts", domain: "Question answering" },
  { name: "MS MARCO", aliases: ["MS MARCO", "MSMARCO"], modality: "Texts", domain: "Information retrieval" },
  {
    name: "WikiText-103",
    aliases: ["WikiText-103", "WikiText103", "WikiText"],
    modality: "Texts",
    domain: "Language modelling",
  },
  { name: "Penn Treebank", aliases: ["Penn Treebank"], modality: "Texts", domain: "Language modelling" },
  {
    name: "C4",
    aliases: ["C4 corpus", "Colossal Clean Crawled Corpus"],
    modality: "Texts",
    domain: "Language modelling",
  },
  { name: "MMLU", aliases: ["MMLU"], modality: "Texts", domain: "Language model evaluation" },
  { name: "GSM8K", aliases: ["GSM8K", "GSM8k"], modality: "Texts", domain: "Mathematical reasoning" },
  { name: "HumanEval", aliases: ["HumanEval"], modality: "Texts", domain: "Code generation" },
  { name: "BEIR", aliases: ["BEIR"], modality: "Texts", domain: "Information retrieval" },
  // graphs
  { name: "Cora", aliases: ["Cora"], modality: "Graphs", domain: "Citation networks" },
  { name: "Citeseer", aliases: ["Citeseer", "CiteSeer"], modality: "Graphs", domain: "Citation networks" },
  {
    name: "PubMed (graph)",
    aliases: ["Pubmed citation", "PubMed citation"],
    modality: "Graphs",
    domain: "Citation networks",
  },
  {
    name: "OGB",
    aliases: ["Open Graph Benchmark", "OGB", "ogbn-arxiv", "ogbn-products"],
    modality: "Graphs",
    domain: "Graph learning",
  },
  { name: "QM9", aliases: ["QM9"], modality: "Graphs", domain: "Molecular property prediction" },
  { name: "ZINC", aliases: ["ZINC"], modality: "Graphs", domain: "Molecular property prediction" },
  {
    name: "PPI",
    aliases: ["protein-protein interaction dataset", "PPI dataset"],
    modality: "Graphs",
    domain: "Biology",
  },
  {
    name: "METR-LA",
    aliases: ["METR-LA", "PEMS-BAY", "PeMS"],
    modality: "Time series",
    domain: "Traffic forecasting",
  },
  // reinforcement learning
  {
    name: "Atari 2600",
    aliases: ["Atari 2600", "Atari games", "Arcade Learning Environment", "Atari"],
    modality: "Environment",
    domain: "Reinforcement learning",
  },
  { name: "MuJoCo", aliases: ["MuJoCo"], modality: "Environment", domain: "Reinforcement learning" },
  { name: "OpenAI Gym", aliases: ["OpenAI Gym"], modality: "Environment", domain: "Reinforcement learning" },
  { name: "D4RL", aliases: ["D4RL"], modality: "Environment", domain: "Offline reinforcement learning" },
  {
    name: "DeepMind Control Suite",
    aliases: ["DeepMind Control Suite", "DM Control"],
    modality: "Environment",
    domain: "Reinforcement learning",
  },
  {
    name: "SMAC",
    aliases: ["StarCraft Multi-Agent Challenge", "SMAC"],
    modality: "Environment",
    domain: "Multi-agent reinforcement learning",
  },
  {
    name: "Meta-World",
    aliases: ["Meta-World", "MetaWorld"],
    modality: "Environment",
    domain: "Reinforcement learning",
  },
  // clinical
  { name: "MIMIC-III", aliases: ["MIMIC-III", "MIMIC III"], modality: "Tabular", domain: "Medical" },
  { name: "MIMIC-IV", aliases: ["MIMIC-IV", "MIMIC IV"], modality: "Tabular", domain: "Medical" },
  { name: "eICU", aliases: ["eICU"], modality: "Tabular", domain: "Medical" },
  { name: "UK Biobank", aliases: ["UK Biobank"], modality: "Tabular", domain: "Medical" },
  { name: "CheXpert", aliases: ["CheXpert"], modality: "Images", domain: "Medical imaging" },
  {
    name: "ChestX-ray14",
    aliases: ["ChestX-ray14", "ChestX-ray8", "NIH chest X-ray"],
    modality: "Images",
    domain: "Medical imaging",
  },
  { name: "PhysioNet Challenge", aliases: ["PhysioNet"], modality: "Time series", domain: "Medical" },
];

// Methods matched in text for papers the archive does not cover. Names that are also ordinary words
// ("Adam", "Dropout") are deliberately absent from this list.
export const METHOD_ALIASES: { name: string; aliases: string[] }[] = [
  { name: "Transformer", aliases: ["Transformer", "Transformers"] },
  { name: "Self-Attention", aliases: ["self-attention", "self attention"] },
  { name: "BERT", aliases: ["BERT"] },
  { name: "GPT", aliases: ["GPT-2", "GPT-3", "GPT-4", "GPT"] },
  {
    name: "Retrieval-Augmented Generation",
    aliases: ["retrieval-augmented generation", "retrieval augmented generation", "RAG"],
  },
  { name: "Low-Rank Adaptation", aliases: ["LoRA", "low-rank adaptation"] },
  { name: "Vision Transformer", aliases: ["Vision Transformer", "ViT"] },
  { name: "ResNet", aliases: ["ResNet", "residual network", "residual networks"] },
  { name: "YOLO", aliases: ["YOLO", "YOLOv3", "YOLOv4", "YOLOv5", "YOLOv7", "YOLOv8"] },
  { name: "Faster R-CNN", aliases: ["Faster R-CNN", "Faster RCNN"] },
  { name: "Mask R-CNN", aliases: ["Mask R-CNN", "Mask RCNN"] },
  { name: "U-Net", aliases: ["U-Net", "UNet"] },
  {
    name: "Generative Adversarial Network",
    aliases: ["generative adversarial network", "generative adversarial networks", "GAN", "GANs"],
  },
  { name: "Variational Autoencoder", aliases: ["variational autoencoder", "VAE"] },
  { name: "Diffusion Model", aliases: ["diffusion model", "diffusion models", "denoising diffusion"] },
  { name: "Contrastive Learning", aliases: ["contrastive learning"] },
  { name: "LSTM", aliases: ["LSTM", "long short-term memory"] },
  { name: "GRU", aliases: ["GRU", "gated recurrent unit"] },
  {
    name: "Graph Convolutional Network",
    aliases: ["graph convolutional network", "graph convolutional networks", "GCN"],
  },
  {
    name: "Graph Attention Network",
    aliases: ["graph attention network", "graph attention networks", "GAT"],
  },
  { name: "GraphSAGE", aliases: ["GraphSAGE"] },
  { name: "Message Passing Neural Network", aliases: ["message passing neural network", "message-passing"] },
  { name: "Node2Vec", aliases: ["node2vec", "DeepWalk"] },
  { name: "Deep Q-Network", aliases: ["deep Q-network", "DQN"] },
  { name: "Proximal Policy Optimization", aliases: ["proximal policy optimization", "PPO"] },
  { name: "Soft Actor-Critic", aliases: ["soft actor-critic", "SAC"] },
  { name: "Actor-Critic", aliases: ["actor-critic", "A3C", "A2C"] },
  { name: "Deep Deterministic Policy Gradient", aliases: ["DDPG", "deep deterministic policy gradient"] },
  { name: "Monte Carlo Tree Search", aliases: ["Monte Carlo tree search", "MCTS"] },
  { name: "RLHF", aliases: ["RLHF", "reinforcement learning from human feedback"] },
  { name: "Surrogate Gradient", aliases: ["surrogate gradient", "surrogate gradients"] },
  { name: "Spike-Timing-Dependent Plasticity", aliases: ["spike-timing-dependent plasticity", "STDP"] },
  {
    name: "Leaky Integrate-and-Fire",
    aliases: ["leaky integrate-and-fire", "LIF neuron", "LIF neurons", "LIF model"],
  },
  {
    name: "ANN-to-SNN Conversion",
    aliases: ["ANN-to-SNN conversion", "ANN-SNN conversion", "ANN to SNN conversion"],
  },
  { name: "Backpropagation Through Time", aliases: ["backpropagation through time", "BPTT"] },
  { name: "Random Forest", aliases: ["random forest", "random forests"] },
  { name: "Gradient Boosting", aliases: ["XGBoost", "gradient boosting", "LightGBM"] },
  { name: "Logistic Regression", aliases: ["logistic regression"] },
  { name: "Federated Learning", aliases: ["federated learning"] },
  { name: "Knowledge Distillation", aliases: ["knowledge distillation"] },
  { name: "Chain-of-Thought Prompting", aliases: ["chain-of-thought", "chain of thought"] },
  { name: "In-Context Learning", aliases: ["in-context learning"] },
  {
    name: "Convolutional Neural Network",
    aliases: ["convolutional neural network", "convolutional neural networks", "CNN", "CNNs"],
  },
  {
    name: "Recurrent Neural Network",
    aliases: ["recurrent neural network", "recurrent neural networks", "RNN", "RNNs"],
  },
  { name: "Multilayer Perceptron", aliases: ["multilayer perceptron", "multi-layer perceptron", "MLP"] },
  { name: "Support Vector Machine", aliases: ["support vector machine", "support vector machines", "SVM"] },
  {
    name: "Attention Mechanism",
    aliases: ["attention mechanism", "attention mechanisms", "multi-head attention"],
  },
  { name: "Graph Neural Network", aliases: ["graph neural network", "graph neural networks", "GNN", "GNNs"] },
  { name: "Autoencoder", aliases: ["autoencoder", "autoencoders", "auto-encoder"] },
  { name: "Transfer Learning", aliases: ["transfer learning"] },
  { name: "Fine-Tuning", aliases: ["fine-tuning", "fine-tuned", "finetuning"] },
  { name: "Prompt Engineering", aliases: ["prompt engineering", "prompting"] },
  { name: "Data Augmentation", aliases: ["data augmentation"] },
  { name: "Self-Supervised Learning", aliases: ["self-supervised learning", "self-supervised"] },
  { name: "Q-Learning", aliases: ["Q-learning"] },
  { name: "Policy Gradient", aliases: ["policy gradient", "policy gradients"] },
  { name: "Multi-Agent Reinforcement Learning", aliases: ["multi-agent reinforcement learning", "MARL"] },
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Acronyms and mixed-case names match case-sensitively; lower-case phrases match in any case.
export function aliasRegex(aliases: string[]): RegExp[] {
  return aliases.map((a) => {
    const caseSensitive = a !== a.toLowerCase();
    return new RegExp(`(?<![\\w-])${escapeRe(a)}(?![\\w-])`, caseSensitive ? "" : "i");
  });
}
