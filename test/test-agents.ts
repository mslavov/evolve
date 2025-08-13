#!/usr/bin/env tsx

import { config } from 'dotenv';
import { getDatabase } from '../src/db/client.js';
import { AgentService } from '../src/services/agent.service.js';

// Load environment variables
config();

async function testAgents() {
  console.log('🧪 Testing Agent System...\n');
  
  const db = getDatabase();
  const agentService = new AgentService(db);
  
  // Service now uses lazy initialization - no need to call initialize()
  
  // Test 1: Scorer agent (must specify agent key)
  console.log('1️⃣ Testing scorer agent:');
  try {
    const result1 = await agentService.run('This is a helpful technical tutorial about Node.js async/await patterns.', {
      agentKey: 'content_scorer'
    });
    console.log('   ✅ Score:', result1.output.score);
    console.log('   Agent:', result1.metadata.agentKey);
    console.log('   Type:', result1.metadata.agentType);
  } catch (error) {
    console.error('   ❌ Error:', error.message);
  }
  
  // Test 2: Prompt generator agent
  console.log('\n2️⃣ Testing prompt generator agent:');
  try {
    const basePrompt = 'Rate the helpfulness of the following content on a scale of 0 to 1.';
    const result2 = await agentService.run(basePrompt, {
      agentKey: 'prompt_generator'
    });
    console.log('   ✅ Generated variation:');
    console.log('   ', result2.output.substring(0, 100) + '...');
    console.log('   Agent:', result2.metadata.agentKey);
    console.log('   Type:', result2.metadata.agentType);
  } catch (error) {
    console.error('   ❌ Error:', error.message);
  }
  
  // Test 3: Agent chain (agent calling agent)
  console.log('\n3️⃣ Testing agent chain (scorer → researcher):');
  try {
    // First run scorer (with explicit agent key)
    const scoreResult = await agentService.run('A basic hello world example in Python.', {
      agentKey: 'content_scorer'
    });
    console.log('   Score result:', scoreResult.output.score);
    
    // Then use researcher to analyze the result
    const researchInput = {
      score: scoreResult.output.score,
      reasoning: scoreResult.output.reasoning,
      content: 'A basic hello world example in Python.'
    };
    
    const researchResult = await agentService.run(JSON.stringify(researchInput), {
      agentKey: 'researcher',
      parentRunId: scoreResult.runId // Track the chain
    });
    console.log('   ✅ Research output:');
    console.log('   ', researchResult.output.substring(0, 150) + '...');
    console.log('   Parent run:', scoreResult.runId);
  } catch (error) {
    console.error('   ❌ Error:', error.message);
  }
  
  console.log('\n✨ Agent system testing complete!');
  process.exit(0);
}

testAgents().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});