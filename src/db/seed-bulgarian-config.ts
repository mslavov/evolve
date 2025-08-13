import { getDatabase } from './client.js';
import { prompts, configs } from './schema/index.js';

// Bulgarian Social Media Usefulness Prompt from iai-ai-usefulness
const BULGARIAN_PROMPT = `You are an expert evaluator for social media content usefulness. Your task is to evaluate how useful a post is for an online social forum community. The content you'll receive is in Bulgarian, but you should understand and evaluate it according to the criteria below.

Rate the usefulness of the post on a scale from 0.0 to 1.0 where:

## Evaluation Criteria:

**0.0 – 0.2: Very Low Usefulness**
- Copied information without personal contribution
- Announcements without value for the community
- Spam or advertising text without value
- Offensive or inappropriate comments
- Very short responses without content ("+1", "agree", "yes")

**0.3 – 0.5: Low Usefulness**
- Information with weak added value
- No personal experience or judgment
- May be useful for someone, but with limited value
- Short responses with minimal content
- Superficial comments

**0.6 – 0.8: Medium to High Usefulness**
- Useful publication with personal contribution
- Precisely collected and structured information
- Shared experience or opinion
- Informative answer to a question
- Good quality content

**0.9 – 1.0: Very High Usefulness**
- Very useful publication with high quality
- Shared detailed personal experience
- Practical advice and guidelines
- Validated and verified information
- Structured and well-organized content
- Recipes, instructions, detailed explanations
- Useful links and resources

## Evaluation Factors:
- **Relevance** to community interests
- **Quality** of information provided
- **Potential** to generate meaningful discussions
- **Helpfulness** to other users
- **Originality** and insight
- **Personal contribution** and experience
- **Structure** and readability of content


## Response format:
**Note:** The content to be evaluated will be in Bulgarian. Please evaluate it based on these criteria and respond ONLY in the following format:

\`\`\`json
{
    "usefulness_score": 0.0-1.0
}
\`\`\``;

export async function seedBulgarianConfig() {
  const db = getDatabase();
  
  console.log('Adding Bulgarian social media usefulness configuration...');
  
  // Add the Bulgarian prompt
  const bulgarianPrompt = {
    version: 'v4_bulgarian_social',
    name: 'Bulgarian Social Media Scorer',
    description: 'Specialized prompt for evaluating Bulgarian social media content usefulness',
    template: BULGARIAN_PROMPT,
    variables: {
      language: 'Bulgarian',
      context: 'social media forum',
    },
    mae: null, // To be evaluated
    correlation: null, // To be evaluated
    createdBy: 'human' as const,
    tags: ['bulgarian', 'social-media', 'community', 'forum'],
    metadata: {
      source: 'iai-ai-usefulness',
      originalModels: ['gpt-4o', 'claude-sonnet-4-20250514'],
    },
    isActive: true,
    isTested: false,
    isProduction: false,
  };
  
  try {
    const [insertedPrompt] = await db.insert(prompts)
      .values(bulgarianPrompt)
      .onConflictDoNothing()
      .returning();
    
    if (insertedPrompt) {
      console.log(`  ✓ Added Bulgarian prompt: ${bulgarianPrompt.version}`);
      
      // Add model configurations
      const modelConfigs = [
        {
          key: 'bulgarian_gpt4o',
          model: 'gpt-4o',
          temperature: 1.0,
          maxTokens: 100,
          promptId: insertedPrompt.id,
          description: 'GPT-4o configuration for Bulgarian social media content (main model)',
          tags: ['bulgarian', 'gpt-4o', 'main'],
          metadata: {
            source: 'iai-ai-usefulness',
            role: 'main',
          },
          isDefault: false,
          isActive: true,
        },
        {
          key: 'bulgarian_claude_sonnet',
          model: 'claude-3-5-sonnet-20241022',
          temperature: 1.0,
          maxTokens: 100,
          promptId: insertedPrompt.id,
          description: 'Claude Sonnet configuration for Bulgarian social media content (backup model)',
          tags: ['bulgarian', 'claude', 'backup'],
          metadata: {
            source: 'iai-ai-usefulness',
            role: 'backup',
            originalModel: 'claude-sonnet-4-20250514',
            note: 'Updated to latest available Claude model',
          },
          isDefault: false,
          isActive: true,
        },
      ];
      
      for (const config of modelConfigs) {
        try {
          await db.insert(configs).values(config).onConflictDoNothing();
          console.log(`  ✓ Added config: ${config.key} (${config.model})`);
        } catch (error) {
          console.log(`  ⚠ Config ${config.key} already exists or error:`, error);
        }
      }
    } else {
      console.log(`  ⚠ Bulgarian prompt ${bulgarianPrompt.version} already exists`);
    }
  } catch (error) {
    console.error('Error seeding Bulgarian configuration:', error);
  }
  
  console.log('Bulgarian configuration seeding complete!');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedBulgarianConfig().catch(console.error).finally(() => process.exit(0));
}