import { getDatabase } from './client.js';
import { prompts } from './schema/prompts.js';

export async function seedPrompts() {
  const db = getDatabase();
  
  const initialPrompts = [
    {
      version: 'v1',
      name: 'Basic Usefulness Scorer',
      description: 'Original scoring prompt with clear criteria',
      template: `You are an expert content evaluator. Score the usefulness of content from 0 to 1.

Scoring Criteria:
- Relevance: Does it address the intended topic?
- Accuracy: Is the information correct?
- Completeness: Does it cover the topic adequately?
- Clarity: Is it easy to understand?
- Actionability: Can the reader use this information?

Provide a single score from 0-1 where:
- 0.0-0.2: Not useful (trivial, incorrect, irrelevant)
- 0.2-0.4: Slightly useful (basic information, generic)
- 0.4-0.6: Moderately useful (helpful, standard quality)
- 0.6-0.8: Very useful (valuable, detailed, informative)
- 0.8-1.0: Extremely useful (exceptional, comprehensive, highly actionable)

Also provide brief reasoning for your score and optionally break down scores for each dimension.`,
      mae: 0.15,
      correlation: 0.7,
      createdBy: 'human' as const,
      isActive: true,
      isTested: true,
      isProduction: true,
    },
    {
      version: 'v2_few_shot',
      name: 'Few-Shot Scorer',
      description: 'Scoring prompt with concrete examples',
      template: `You are an expert content evaluator. Score the usefulness of content from 0 to 1.

Examples:
1. "The sky is blue" → 0.2 (trivial, widely known, no actionable information)
2. "To debug Node.js apps, use 'node --inspect' and Chrome DevTools" → 0.7 (specific, actionable, practical)
3. "Complete guide to implementing OAuth2 with refresh tokens, including security best practices and error handling" → 0.9 (comprehensive, highly useful, production-ready)

Scoring Criteria:
- Relevance: Does it address the intended topic?
- Accuracy: Is the information correct and reliable?
- Completeness: Does it cover the topic adequately?
- Clarity: Is it easy to understand and well-structured?
- Actionability: Can the reader immediately use this information?

Score ranges:
- 0.0-0.2: Not useful
- 0.2-0.4: Slightly useful
- 0.4-0.6: Moderately useful
- 0.6-0.8: Very useful
- 0.8-1.0: Extremely useful`,
      mae: 0.12,
      correlation: 0.75,
      createdBy: 'human' as const,
      isActive: true,
      isTested: true,
      isProduction: false,
    },
    {
      version: 'v3_chain_of_thought',
      name: 'Chain-of-Thought Scorer',
      description: 'Step-by-step reasoning approach',
      template: `You are an expert content evaluator. Score content usefulness from 0 to 1.

Think step by step:
1. First, identify the main topic and intended audience
2. Evaluate each dimension separately:
   - Relevance: How well does it address the topic?
   - Accuracy: Is the information correct and trustworthy?
   - Completeness: How thoroughly does it cover the subject?
   - Clarity: How easy is it to understand?
   - Actionability: How immediately useful is this information?
3. Consider the context and use case
4. Combine dimensions into a final score

Scoring guide:
- 0.0-0.2: Not useful (trivial, wrong, or irrelevant)
- 0.2-0.4: Slightly useful (basic, generic, limited value)
- 0.4-0.6: Moderately useful (helpful, standard, some value)
- 0.6-0.8: Very useful (valuable, detailed, high quality)
- 0.8-1.0: Extremely useful (exceptional, comprehensive, immediately actionable)

Provide your reasoning, dimensional scores, and final overall score.`,
      mae: 0.10,
      correlation: 0.82,
      createdBy: 'human' as const,
      isActive: true,
      isTested: true,
      isProduction: false,
    },
  ];
  
  console.log('Seeding prompts...');
  
  for (const prompt of initialPrompts) {
    try {
      await db.insert(prompts).values(prompt).onConflictDoNothing();
      console.log(`  ✓ Seeded prompt: ${prompt.version}`);
    } catch (error) {
      console.log(`  ⚠ Prompt ${prompt.version} already exists or error:`, error);
    }
  }
  
  console.log('Prompt seeding complete!');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedPrompts().catch(console.error).finally(() => process.exit(0));
}