import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { 
  LLMProvider, 
  LLMConfig, 
  LLMMessage, 
  LLMResponse 
} from './llm-provider.interface.js';

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private client: Anthropic;
  
  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
  }

  supportsModel(model: string): boolean {
    const supportedModels = [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
      'claude-2.1',
      'claude-2.0',
      'claude-instant-1.2',
    ];
    
    return supportedModels.some(supported => 
      model.startsWith(supported) || model === supported
    );
  }

  getDefaultConfig(model: string): LLMConfig {
    return {
      model,
      temperature: 0.7,
      maxTokens: 1000,
      topP: 1,
    };
  }

  async generateText(
    messages: LLMMessage[],
    config?: Partial<LLMConfig>
  ): Promise<LLMResponse<string>> {
    const finalConfig = {
      ...this.getDefaultConfig(config?.model || 'claude-3-5-sonnet-20241022'),
      ...config,
    };

    // Separate system message from other messages
    const systemMessage = messages.find(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    const response = await this.client.messages.create({
      model: finalConfig.model,
      system: systemMessage?.content,
      messages: otherMessages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      })),
      temperature: finalConfig.temperature,
      max_tokens: finalConfig.maxTokens || 1000,
      top_p: finalConfig.topP,
    });

    // Extract text content
    const textContent = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');
    
    return {
      content: textContent,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      model: response.model,
      finishReason: response.stop_reason || undefined,
      refusal: null,
    };
  }

  async generateStructured<T>(
    messages: LLMMessage[],
    schema: z.ZodSchema<T>,
    config?: Partial<LLMConfig>
  ): Promise<LLMResponse<T>> {
    const finalConfig = {
      ...this.getDefaultConfig(config?.model || 'claude-3-5-sonnet-20241022'),
      ...config,
    };

    // Use tool calling for structured output
    const toolSchema = this.zodToAnthropicTool(schema);
    
    // Separate system message from other messages
    const systemMessage = messages.find(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    const response = await this.client.messages.create({
      model: finalConfig.model,
      system: systemMessage?.content,
      messages: otherMessages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      })),
      temperature: finalConfig.temperature,
      max_tokens: finalConfig.maxTokens || 1000,
      top_p: finalConfig.topP,
      tools: [{
        name: 'respond_structured',
        description: 'Respond with structured data according to the schema',
        input_schema: toolSchema,
      }],
      tool_choice: {
        type: 'tool',
        name: 'respond_structured',
      },
    });

    // Extract tool use response
    const toolUse = response.content.find(
      block => block.type === 'tool_use' && block.name === 'respond_structured'
    );

    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new Error('No structured response in output');
    }

    // Validate with Zod schema
    const validated = schema.parse(toolUse.input);
    
    return {
      content: validated,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      model: response.model,
      finishReason: response.stop_reason || undefined,
      refusal: null,
    };
  }

  private zodToAnthropicTool(schema: z.ZodSchema<any>): any {
    // Convert Zod schema to Anthropic tool schema format
    const zodType = schema._def as any;
    
    if (zodType.typeName === 'ZodObject') {
      const shape = zodType.shape();
      const properties: any = {};
      const required: string[] = [];
      
      for (const [key, value] of Object.entries(shape)) {
        const fieldSchema = value as z.ZodSchema<any>;
        properties[key] = this.zodToAnthropicTool(fieldSchema);
        
        // Add description if available
        if (fieldSchema._def.description) {
          properties[key].description = fieldSchema._def.description;
        }
        
        if (!fieldSchema.isOptional()) {
          required.push(key);
        }
      }
      
      return {
        type: 'object',
        properties,
        required,
      };
    }
    
    if (zodType.typeName === 'ZodString') {
      const schema: any = { type: 'string' };
      if (zodType.checks) {
        for (const check of zodType.checks) {
          if (check.kind === 'min') schema.minLength = check.value;
          if (check.kind === 'max') schema.maxLength = check.value;
        }
      }
      return schema;
    }
    
    if (zodType.typeName === 'ZodNumber') {
      const schema: any = { type: 'number' };
      if (zodType.checks) {
        for (const check of zodType.checks) {
          if (check.kind === 'min') schema.minimum = check.value;
          if (check.kind === 'max') schema.maximum = check.value;
        }
      }
      return schema;
    }
    
    if (zodType.typeName === 'ZodBoolean') {
      return { type: 'boolean' };
    }
    
    if (zodType.typeName === 'ZodArray') {
      return {
        type: 'array',
        items: this.zodToAnthropicTool(zodType.type),
      };
    }
    
    if (zodType.typeName === 'ZodOptional') {
      return this.zodToAnthropicTool(zodType.innerType);
    }
    
    if (zodType.typeName === 'ZodEnum') {
      return {
        type: 'string',
        enum: zodType.values,
      };
    }
    
    if (zodType.typeName === 'ZodLiteral') {
      return {
        type: typeof zodType.value === 'string' ? 'string' : 
              typeof zodType.value === 'number' ? 'number' : 
              typeof zodType.value === 'boolean' ? 'boolean' : 'string',
        const: zodType.value,
      };
    }
    
    // Default fallback
    return { type: 'string' };
  }
}