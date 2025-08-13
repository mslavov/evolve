import OpenAI from 'openai';
import { z } from 'zod';
import type { 
  LLMProvider, 
  LLMConfig, 
  LLMMessage, 
  LLMResponse 
} from './llm-provider.interface.js';

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  private client: OpenAI;
  
  constructor(apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
  }

  supportsModel(model: string): boolean {
    const supportedModels = [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4o-2024-08-06',
      'gpt-4o-mini-2024-07-18',
      'gpt-4-turbo',
      'gpt-4-turbo-preview',
      'gpt-4',
      'gpt-3.5-turbo',
      'o1-preview',
      'o1-mini',
    ];
    
    return supportedModels.some(supported => 
      model.startsWith(supported) || model === supported
    );
  }

  getDefaultConfig(model: string): LLMConfig {
    // O1 models have specific requirements
    if (model.startsWith('o1')) {
      return {
        model,
        temperature: 1, // O1 models only support temperature=1
        maxTokens: 4096,
      };
    }
    
    return {
      model,
      temperature: 0.7,
      maxTokens: 1000,
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0,
    };
  }

  async generateText(
    messages: LLMMessage[],
    config?: Partial<LLMConfig>
  ): Promise<LLMResponse<string>> {
    const finalConfig = {
      ...this.getDefaultConfig(config?.model || 'gpt-4o-mini'),
      ...config,
    };

    const completion = await this.client.chat.completions.create({
      model: finalConfig.model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      temperature: finalConfig.temperature,
      max_tokens: finalConfig.maxTokens,
      top_p: finalConfig.topP,
      frequency_penalty: finalConfig.frequencyPenalty,
      presence_penalty: finalConfig.presencePenalty,
    });

    const choice = completion.choices[0];
    
    return {
      content: choice.message.content || '',
      usage: completion.usage ? {
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens,
      } : undefined,
      model: completion.model,
      finishReason: choice.finish_reason || undefined,
      refusal: choice.message.refusal || null,
    };
  }

  async generateStructured<T>(
    messages: LLMMessage[],
    schema: z.ZodSchema<T>,
    config?: Partial<LLMConfig>
  ): Promise<LLMResponse<T>> {
    const finalConfig = {
      ...this.getDefaultConfig(config?.model || 'gpt-4o-mini'),
      ...config,
    };

    // For O1 models or older models, use function calling approach
    if (finalConfig.model.startsWith('o1') || 
        finalConfig.model.includes('gpt-3.5') || 
        finalConfig.model === 'gpt-4') {
      return this.generateStructuredViaTools(messages, schema, finalConfig);
    }

    // For newer models, use tool-based approach since beta.parse might not be available
    return this.generateStructuredViaTools(messages, schema, finalConfig);
  }

  private async generateStructuredViaTools<T>(
    messages: LLMMessage[],
    schema: z.ZodSchema<T>,
    config: LLMConfig
  ): Promise<LLMResponse<T>> {
    // Convert Zod schema to JSON Schema for tool definition
    const jsonSchema = this.zodToJsonSchema(schema);
    
    const completion = await this.client.chat.completions.create({
      model: config.model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      tools: [{
        type: 'function',
        function: {
          name: 'respond_with_structure',
          description: 'Respond with the requested structured data',
          parameters: jsonSchema,
        },
      }],
      tool_choice: {
        type: 'function',
        function: { name: 'respond_with_structure' },
      },
    });

    const choice = completion.choices[0];
    const toolCall = choice.message.tool_calls?.[0];
    
    if (!toolCall || toolCall.type !== 'function' || !toolCall.function.arguments) {
      throw new Error('No tool call in response');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (error) {
      console.error('Failed to parse tool response:', toolCall.function.arguments);
      throw new Error(`Invalid JSON in tool response: ${error}`);
    }
    
    // Normalize scores if they're out of range (common GPT issue)
    if (parsed.score !== undefined && parsed.score > 1) {
      parsed.score = parsed.score / 100; // Assume it's a percentage
    }
    
    if (parsed.dimensions) {
      for (const key of Object.keys(parsed.dimensions)) {
        if (parsed.dimensions[key] > 1) {
          parsed.dimensions[key] = parsed.dimensions[key] / 100; // Assume percentage
        }
      }
    }
    
    const validated = schema.parse(parsed);
    
    return {
      content: validated,
      usage: completion.usage ? {
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens,
      } : undefined,
      model: completion.model,
      finishReason: choice.finish_reason || undefined,
      refusal: null,
    };
  }

  private zodToJsonSchema(schema: z.ZodSchema<any>): any {
    // Basic Zod to JSON Schema conversion
    // Note: For production, consider using a library like zod-to-json-schema
    const zodType = schema._def as any;
    
    if (zodType.typeName === 'ZodObject') {
      const shape = zodType.shape();
      const properties: any = {};
      const required: string[] = [];
      
      for (const [key, value] of Object.entries(shape)) {
        const fieldSchema = value as any;
        properties[key] = this.zodToJsonSchema(fieldSchema);
        
        // Check if field is optional
        if (fieldSchema._def.typeName !== 'ZodOptional') {
          required.push(key);
        }
      }
      
      // For strict mode, if all fields are optional, don't include required array
      // Otherwise include all fields that are not optional
      const result: any = {
        type: 'object',
        properties,
        additionalProperties: false,
      };
      
      if (required.length > 0) {
        result.required = required;
      }
      
      return result;
    }
    
    if (zodType.typeName === 'ZodString') {
      return { type: 'string' };
    }
    
    if (zodType.typeName === 'ZodNumber') {
      return { type: 'number' };
    }
    
    if (zodType.typeName === 'ZodBoolean') {
      return { type: 'boolean' };
    }
    
    if (zodType.typeName === 'ZodArray') {
      return {
        type: 'array',
        items: this.zodToJsonSchema(zodType.type),
      };
    }
    
    if (zodType.typeName === 'ZodOptional') {
      return this.zodToJsonSchema(zodType.innerType);
    }
    
    // Default fallback
    return { type: 'string' };
  }
}