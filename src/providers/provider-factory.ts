import { OpenAIProvider } from './openai.provider.js';
import { AnthropicProvider } from './anthropic.provider.js';
import type { LLMProvider, LLMProviderFactory } from './llm-provider.interface.js';

export class ProviderFactory implements LLMProviderFactory {
  private providers: Map<string, LLMProvider> = new Map();
  
  constructor() {
    // Initialize providers lazily
  }

  createProvider(model: string): LLMProvider {
    // Determine provider based on model name
    const providerName = this.detectProviderFromModel(model);
    
    // Return cached provider or create new one
    if (!this.providers.has(providerName)) {
      this.providers.set(providerName, this.createProviderInstance(providerName));
    }
    
    const provider = this.providers.get(providerName)!;
    
    // Verify the provider supports the model
    if (!provider.supportsModel(model)) {
      throw new Error(
        `Provider '${provider.name}' does not support model '${model}'. ` +
        `Please check the model name or use a different provider.`
      );
    }
    
    return provider;
  }

  private detectProviderFromModel(model: string): string {
    // OpenAI models
    if (model.startsWith('gpt') || 
        model.startsWith('o1') || 
        model.includes('turbo')) {
      return 'openai';
    }
    
    // Anthropic models
    if (model.startsWith('claude') || 
        model.includes('claude')) {
      return 'anthropic';
    }
    
    // Default to OpenAI for unknown models
    console.warn(`Unknown model '${model}', defaulting to OpenAI provider`);
    return 'openai';
  }

  private createProviderInstance(providerName: string): LLMProvider {
    switch (providerName) {
      case 'openai':
        return new OpenAIProvider();
      case 'anthropic':
        return new AnthropicProvider();
      default:
        throw new Error(`Unknown provider: ${providerName}`);
    }
  }

  /**
   * Get a list of all supported models across all providers
   */
  getSupportedModels(): string[] {
    return [
      // OpenAI models
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4o-2024-08-06',
      'gpt-4o-mini-2024-07-18',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo',
      'o1-preview',
      'o1-mini',
      // Anthropic models
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
    ];
  }

  /**
   * Clear cached providers
   */
  clearCache(): void {
    this.providers.clear();
  }
}

// Export singleton instance
export const providerFactory = new ProviderFactory();