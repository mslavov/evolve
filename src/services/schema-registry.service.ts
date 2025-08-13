import { z } from 'zod';
import { scoringSchema } from '../types/index.js';

export type SchemaDefinition = {
  name: string;
  version: string;
  description?: string;
  schema: z.ZodSchema<any>;
  jsonSchema?: Record<string, any>;
  example?: any;
};

export type SchemaType = 
  | 'scoring'
  | 'classification' 
  | 'extraction'
  | 'summarization'
  | 'translation'
  | 'custom';

export class SchemaRegistry {
  private schemas: Map<string, SchemaDefinition> = new Map();
  
  constructor() {
    this.registerDefaultSchemas();
  }
  
  /**
   * Register default schemas
   */
  private registerDefaultSchemas(): void {
    // Default scoring schema
    this.register({
      name: 'scoring',
      version: '1.0.0',
      description: 'Default content usefulness scoring schema',
      schema: scoringSchema,
      example: {
        score: 0.85,
        reasoning: 'The content is highly useful and well-structured',
        dimensions: {
          relevance: 0.9,
          accuracy: 0.85,
          completeness: 0.8,
          clarity: 0.9,
          actionability: 0.8
        }
      }
    });
    
    // Classification schema
    this.register({
      name: 'classification',
      version: '1.0.0',
      description: 'Content classification schema',
      schema: z.object({
        category: z.string().describe('Primary category'),
        subcategories: z.array(z.string()).optional().describe('Subcategories'),
        confidence: z.number().min(0).max(1).describe('Classification confidence'),
        reasoning: z.string().describe('Explanation for classification')
      }),
      example: {
        category: 'technical',
        subcategories: ['programming', 'javascript'],
        confidence: 0.95,
        reasoning: 'Content contains code examples and technical explanations'
      }
    });
    
    // Extraction schema
    this.register({
      name: 'extraction',
      version: '1.0.0',
      description: 'Information extraction schema',
      schema: z.object({
        entities: z.array(z.object({
          type: z.string().describe('Entity type'),
          value: z.string().describe('Entity value'),
          confidence: z.number().min(0).max(1).optional()
        })).describe('Extracted entities'),
        keyPoints: z.array(z.string()).optional().describe('Key points'),
        metadata: z.record(z.any()).optional()
      }),
      example: {
        entities: [
          { type: 'person', value: 'John Doe', confidence: 0.9 },
          { type: 'organization', value: 'Acme Corp', confidence: 0.85 }
        ],
        keyPoints: ['Product launch announced', 'Q4 revenue targets met'],
        metadata: { source: 'article', date: '2024-01-15' }
      }
    });
    
    // Summarization schema
    this.register({
      name: 'summarization',
      version: '1.0.0',
      description: 'Content summarization schema',
      schema: z.object({
        summary: z.string().describe('Concise summary'),
        bulletPoints: z.array(z.string()).optional().describe('Key bullet points'),
        length: z.enum(['short', 'medium', 'long']).optional(),
        keywords: z.array(z.string()).optional()
      }),
      example: {
        summary: 'This article discusses the latest developments in AI technology',
        bulletPoints: [
          'New breakthrough in language models',
          'Improved efficiency by 40%',
          'Available for public testing'
        ],
        length: 'medium',
        keywords: ['AI', 'technology', 'language models']
      }
    });
    
    // Translation schema
    this.register({
      name: 'translation',
      version: '1.0.0',
      description: 'Translation output schema',
      schema: z.object({
        translatedText: z.string().describe('Translated content'),
        sourceLanguage: z.string().optional(),
        targetLanguage: z.string(),
        confidence: z.number().min(0).max(1).optional(),
        alternativeTranslations: z.array(z.string()).optional()
      }),
      example: {
        translatedText: 'Hello, how are you?',
        sourceLanguage: 'es',
        targetLanguage: 'en',
        confidence: 0.98,
        alternativeTranslations: ['Hi, how are you doing?']
      }
    });
  }
  
  /**
   * Register a new schema
   */
  register(definition: SchemaDefinition): void {
    const key = `${definition.name}@${definition.version}`;
    this.schemas.set(key, definition);
    // Also register without version for convenience
    this.schemas.set(definition.name, definition);
  }
  
  /**
   * Get a schema by name and optional version
   */
  get(name: string, version?: string): SchemaDefinition | undefined {
    if (version) {
      return this.schemas.get(`${name}@${version}`);
    }
    return this.schemas.get(name);
  }
  
  /**
   * Get all registered schemas
   */
  getAll(): SchemaDefinition[] {
    const uniqueSchemas = new Map<string, SchemaDefinition>();
    for (const [key, schema] of this.schemas) {
      if (!key.includes('@')) {
        uniqueSchemas.set(schema.name, schema);
      }
    }
    return Array.from(uniqueSchemas.values());
  }
  
  /**
   * Create a Zod schema from JSON definition
   */
  createFromJSON(jsonDef: Record<string, any>): z.ZodSchema<any> {
    return this.jsonToZod(jsonDef);
  }
  
  /**
   * Convert JSON schema definition to Zod schema
   */
  private jsonToZod(def: any): z.ZodSchema<any> {
    if (!def || !def.type) {
      throw new Error('Invalid schema definition: missing type');
    }
    
    switch (def.type) {
      case 'string':
        if (def.enum) {
          const enumSchema = z.enum(def.enum as [string, ...string[]]);
          return def.optional ? enumSchema.optional() : enumSchema;
        }
        let stringSchema: z.ZodString | z.ZodOptional<z.ZodString> = z.string();
        if (def.description) stringSchema = stringSchema.describe(def.description);
        if (def.minLength) stringSchema = (stringSchema as z.ZodString).min(def.minLength);
        if (def.maxLength) stringSchema = (stringSchema as z.ZodString).max(def.maxLength);
        if (def.optional) stringSchema = (stringSchema as z.ZodString).optional();
        return stringSchema;
        
      case 'number':
        let numberSchema: z.ZodNumber | z.ZodOptional<z.ZodNumber> = z.number();
        if (def.description) numberSchema = numberSchema.describe(def.description);
        if (def.min !== undefined) numberSchema = (numberSchema as z.ZodNumber).min(def.min);
        if (def.max !== undefined) numberSchema = (numberSchema as z.ZodNumber).max(def.max);
        if (def.optional) numberSchema = (numberSchema as z.ZodNumber).optional();
        return numberSchema;
        
      case 'boolean':
        let boolSchema: z.ZodBoolean | z.ZodOptional<z.ZodBoolean> = z.boolean();
        if (def.description) boolSchema = boolSchema.describe(def.description);
        if (def.optional) boolSchema = (boolSchema as z.ZodBoolean).optional();
        return boolSchema;
        
      case 'array':
        if (!def.items) {
          throw new Error('Array schema must have items definition');
        }
        let arraySchema: z.ZodArray<any> | z.ZodOptional<z.ZodArray<any>> = z.array(this.jsonToZod(def.items));
        if (def.description) arraySchema = arraySchema.describe(def.description);
        if (def.minItems) arraySchema = (arraySchema as z.ZodArray<any>).min(def.minItems);
        if (def.maxItems) arraySchema = (arraySchema as z.ZodArray<any>).max(def.maxItems);
        if (def.optional) arraySchema = (arraySchema as z.ZodArray<any>).optional();
        return arraySchema;
        
      case 'object':
        if (!def.properties) {
          return def.optional ? z.record(z.any()).optional() : z.record(z.any());
        }
        const shape: Record<string, z.ZodSchema<any>> = {};
        for (const [key, value] of Object.entries(def.properties)) {
          shape[key] = this.jsonToZod(value);
        }
        let objectSchema: z.ZodObject<any> | z.ZodOptional<z.ZodObject<any>> = z.object(shape);
        if (def.description) objectSchema = objectSchema.describe(def.description);
        if (def.optional) objectSchema = (objectSchema as z.ZodObject<any>).optional();
        return objectSchema;
        
      case 'record':
        const recordSchema = z.record(def.value ? this.jsonToZod(def.value) : z.any());
        return def.optional ? recordSchema.optional() : recordSchema;
        
      case 'any':
        return def.optional ? z.any().optional() : z.any();
        
      default:
        throw new Error(`Unsupported schema type: ${def.type}`);
    }
  }
  
  /**
   * Validate data against a schema
   */
  validate(schemaName: string, data: any): { success: boolean; data?: any; error?: string } {
    const schemaDef = this.get(schemaName);
    if (!schemaDef) {
      return { success: false, error: `Schema ${schemaName} not found` };
    }
    
    try {
      const parsed = schemaDef.schema.parse(data);
      return { success: true, data: parsed };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { success: false, error: error.errors.map(e => e.message).join(', ') };
      }
      return { success: false, error: String(error) };
    }
  }
  
  /**
   * Export schema as JSON for storage
   */
  exportAsJSON(schemaName: string): Record<string, any> | undefined {
    const schemaDef = this.get(schemaName);
    if (!schemaDef) return undefined;
    
    return {
      name: schemaDef.name,
      version: schemaDef.version,
      description: schemaDef.description,
      jsonSchema: schemaDef.jsonSchema || this.zodToJSON(schemaDef.schema),
      example: schemaDef.example
    };
  }
  
  /**
   * Convert Zod schema to simplified JSON representation
   */
  private zodToJSON(schema: z.ZodSchema<any>): Record<string, any> {
    // This is a simplified conversion - in production you might want to use
    // a library like zod-to-json-schema
    const def = (schema as any)._def;
    
    if (def.typeName === 'ZodString') {
      return { type: 'string', description: def.description };
    } else if (def.typeName === 'ZodNumber') {
      return { type: 'number', description: def.description };
    } else if (def.typeName === 'ZodBoolean') {
      return { type: 'boolean', description: def.description };
    } else if (def.typeName === 'ZodArray') {
      return { type: 'array', items: this.zodToJSON(def.type) };
    } else if (def.typeName === 'ZodObject') {
      const properties: Record<string, any> = {};
      for (const [key, value] of Object.entries(def.shape())) {
        properties[key] = this.zodToJSON(value as z.ZodSchema<any>);
      }
      return { type: 'object', properties };
    }
    
    return { type: 'any' };
  }
}

// Singleton instance
export const schemaRegistry = new SchemaRegistry();