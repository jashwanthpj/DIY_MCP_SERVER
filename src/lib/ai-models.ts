export type AIProvider = "openai" | "anthropic" | "google";

export interface AIModel {
  id: string;
  name: string;
  provider: AIProvider;
  thinking: boolean;
}

export const AI_MODELS: AIModel[] = [
  // OpenAI — reasoning
  { id: "o3", name: "o3", provider: "openai", thinking: true },
  { id: "o4-mini", name: "o4-mini", provider: "openai", thinking: true },
  // OpenAI — GPT
  { id: "gpt-4.1", name: "GPT-4.1", provider: "openai", thinking: false },
  { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", provider: "openai", thinking: false },
  { id: "gpt-4.1-nano", name: "GPT-4.1 Nano", provider: "openai", thinking: false },
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", thinking: false },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", thinking: false },

  // Anthropic
  { id: "claude-sonnet-4-6-20260217", name: "Claude Sonnet 4.6", provider: "anthropic", thinking: true },
  { id: "claude-opus-4-6-20251120", name: "Claude Opus 4.6", provider: "anthropic", thinking: true },
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "anthropic", thinking: true },
  { id: "claude-opus-4-20250514", name: "Claude Opus 4", provider: "anthropic", thinking: true },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", provider: "anthropic", thinking: false },
  { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", provider: "anthropic", thinking: false },

  // Google Gemini
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google", thinking: true },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google", thinking: true },
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", provider: "google", thinking: false },
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "google", thinking: false },
];

export const PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
};

export const HUB_ENV_KEYS: Record<AIProvider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_API_KEY",
};
