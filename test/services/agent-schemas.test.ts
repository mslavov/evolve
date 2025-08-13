import { describe, it, expect } from 'vitest';
import { schemaRegistry } from '../../src/services/schema-registry.service';

describe('Agent Schema Registry', () => {
  describe('Predefined Schemas', () => {
    it('should have classification schema', () => {
      const schema = schemaRegistry.get('classification');
      expect(schema).toBeDefined();
      expect(schema?.name).toBe('classification');
      expect(schema?.description).toContain('classification');
    });

    it('should have extraction schema', () => {
      const schema = schemaRegistry.get('extraction');
      expect(schema).toBeDefined();
      expect(schema?.name).toBe('extraction');
      expect(schema?.description).toContain('extraction');
    });

    it('should have scoring schema', () => {
      const schema = schemaRegistry.get('scoring');
      expect(schema).toBeDefined();
      expect(schema?.name).toBe('scoring');
      expect(schema?.description).toContain('scoring');
    });

    it('should have summarization schema', () => {
      const schema = schemaRegistry.get('summarization');
      expect(schema).toBeDefined();
      expect(schema?.name).toBe('summarization');
      expect(schema?.description).toContain('summarization');
    });
  });

  describe('Schema Registry Operations', () => {
    it('should list all available schemas', () => {
      const schemas = schemaRegistry.getAll();
      expect(Array.isArray(schemas)).toBe(true);
      expect(schemas.length).toBeGreaterThan(0);
      
      const schemaNames = schemas.map(s => s.name);
      expect(schemaNames).toContain('classification');
      expect(schemaNames).toContain('extraction');
      expect(schemaNames).toContain('scoring');
      expect(schemaNames).toContain('summarization');
    });

    it('should create schema from JSON', () => {
      const jsonSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      };
      
      const zodSchema = schemaRegistry.createFromJSON(jsonSchema);
      expect(zodSchema).toBeDefined();
      
      // Test parsing
      const valid = { name: 'John', age: 30 };
      const parsed = zodSchema.parse(valid);
      expect(parsed).toEqual(valid);
      
      // Test validation
      const invalid = { age: 30 }; // missing required 'name'
      expect(() => zodSchema.parse(invalid)).toThrow();
    });

    it('should handle complex JSON schemas', () => {
      const complexSchema = {
        type: 'object',
        properties: {
          company: {
            type: 'string',
            description: 'Company name',
          },
          metrics: {
            type: 'object',
            properties: {
              revenue: {
                type: 'number',
                description: 'Revenue in billions',
              },
              growth: {
                type: 'number',
                description: 'YoY growth percentage',
              },
            },
          },
          sentiment: {
            type: 'string',
            enum: ['positive', 'negative', 'neutral'],
            description: 'Market sentiment',
          },
        },
      };
      
      const zodSchema = schemaRegistry.createFromJSON(complexSchema);
      expect(zodSchema).toBeDefined();
      
      const valid = {
        company: 'Apple',
        metrics: {
          revenue: 120,
          growth: 15,
        },
        sentiment: 'positive',
      };
      
      const parsed = zodSchema.parse(valid);
      expect(parsed).toEqual(valid);
    });
  });
});