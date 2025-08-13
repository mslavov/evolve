import { z } from 'zod';

/**
 * LLM Provider Interface
 * Defines a common interface for different LLM providers (OpenAI, Anthropic, etc.)
 */

export interface LLMConfig {
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse<T = string> {
  content: T;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model?: string;
  finishReason?: string;
  refusal?: string | null;
}

export interface LLMProvider {
  /**
   * Provider name (e.g., 'openai', 'anthropic')
   */
  readonly name: string;

  /**
   * Generate a text completion
   */
  generateText(
    messages: LLMMessage[],
    config?: Partial<LLMConfig>
  ): Promise<LLMResponse<string>>;

  /**
   * Generate a structured output using a Zod schema
   */
  generateStructured<T>(
    messages: LLMMessage[],
    schema: z.ZodSchema<T>,
    config?: Partial<LLMConfig>
  ): Promise<LLMResponse<T>>;

  /**
   * Check if the provider supports a specific model
   */
  supportsModel(model: string): boolean;

  /**
   * Get default configuration for a model
   */
  getDefaultConfig(model: string): LLMConfig;
}

/**
 * Factory for creating LLM providers
 */
export interface LLMProviderFactory {
  createProvider(model: string): LLMProvider;
}