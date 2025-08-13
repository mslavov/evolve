import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { AgentService } from '../../services/agent.service.js';
import { getDatabase } from '../../db/client.js';

export function createAgentCommand() {
  const command = new Command('agent');
  
  command
    .description('Manage agents (scorers, evaluators, optimizers)')
    .addCommand(createListCommand())
    .addCommand(createCreateCommand())
    .addCommand(createShowCommand())
    .addCommand(createUpdateCommand())
    .addCommand(createDeleteCommand())
    .addCommand(createCloneCommand())
    .addCommand(createVersionCommand())
    .addCommand(createHistoryCommand())
    .addCommand(createRollbackCommand());
  
  return command;
}

function createListCommand() {
  return new Command('list')
    .description('List all agents')
    .action(async () => {
      const spinner = ora('Loading agents...').start();
      
      try {
        const db = getDatabase();
        const agentService = new AgentService(db);
        
        const agents = await agentService.listAgents();
        
        spinner.stop();
        
        if (agents.length === 0) {
          console.log(chalk.yellow('No agents found'));
          return;
        }
        
        console.log(chalk.cyan('\n🤖 Agents:\n'));
        
        for (const agent of agents) {
          const activeMark = agent.isActive ? '' : chalk.red(' [INACTIVE]');
          const systemMark = agent.isSystemAgent ? chalk.blue(' [SYSTEM]') : '';
          
          console.log(chalk.bold(`${agent.key}${activeMark}${systemMark}`));
          console.log(`  Name: ${agent.name}`);
          console.log(`  Type: ${chalk.magenta(agent.type)}`);
          console.log(`  Model: ${agent.model}`);
          console.log(`  Temperature: ${agent.temperature}`);
          console.log(`  Prompt ID: ${agent.promptId}`);
          
          if (agent.description) {
            console.log(`  Description: ${agent.description}`);
          }
          
          if (agent.averageScore) {
            console.log(`  Average Score: ${agent.averageScore.toFixed(3)}`);
          }
          
          if (agent.evaluationCount) {
            console.log(`  Evaluations: ${agent.evaluationCount}`);
          }
          
          console.log();
        }
      } catch (error) {
        spinner.fail('Failed to load agents');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}

function createCreateCommand() {
  return new Command('create')
    .description('Create a new agent')
    .argument('<key>', 'Agent key')
    .option('-n, --name <name>', 'Agent display name')
    .option('--type <type>', 'Agent type (scorer, evaluator, optimizer, researcher, generator)', 'scorer')
    .option('-d, --description <desc>', 'Agent description')
    .option('-m, --model <model>', 'Model to use')
    .option('-t, --temperature <temp>', 'Temperature setting', parseFloat)
    .option('-p, --prompt <content>', 'Prompt template content (use {{input}} for the input placeholder)')
    .option('--prompt-id <version>', 'Existing prompt version ID')
    .option('--prompt-file <path>', 'Path to file containing prompt template')
    .option('--max-tokens <n>', 'Maximum tokens', parseInt)
    .option('--output-type <type>', 'Output type: structured or text', 'structured')
    .option('--schema-file <path>', 'Path to JSON file containing custom output schema')
    .action(async (key, options) => {
      const spinner = ora('Saving agent...').start();
      
      try {
        const db = getDatabase();
        const agentService = new AgentService(db);
        
        // Handle schema configuration
        let outputSchema = undefined;
        
        if (options.schemaFile) {
          // Load custom schema from file
          const fs = await import('fs/promises');
          const schemaContent = await fs.readFile(options.schemaFile, 'utf-8');
          outputSchema = JSON.parse(schemaContent);
        }
        
        // Handle prompt - either inline content, file, or existing prompt ID
        let agent;
        if (options.prompt || options.promptFile) {
          // Create agent with new prompt
          let promptContent = options.prompt;
          if (options.promptFile) {
            const fs = await import('fs/promises');
            promptContent = await fs.readFile(options.promptFile, 'utf-8');
          }
          
          if (!promptContent) {
            throw new Error('Prompt content is required when creating a new agent');
          }
          
          agent = await agentService.createAgent(
            key,
            options.name || key,
            promptContent,
            {
              type: options.type,
              model: options.model || 'gpt-4o-mini',
              temperature: options.temperature ?? 0.7,
              maxTokens: options.maxTokens,
              outputType: options.outputType,
              outputSchema,
              description: options.description,
            }
          );
        } else if (options.promptId) {
          // Use existing prompt
          agent = await agentService.saveAgent(key, {
            name: options.name || key,
            type: options.type,
            description: options.description,
            model: options.model || 'gpt-4o-mini',
            temperature: options.temperature ?? 0.7,
            promptId: options.promptId,
            maxTokens: options.maxTokens,
            outputType: options.outputType,
            outputSchema,
          });
        } else {
          throw new Error('Either --prompt, --prompt-file, or --prompt-id is required');
        }
        
        spinner.succeed('Agent saved successfully!');
        console.log(chalk.gray(`Key: ${agent.key}`));
        console.log(chalk.gray(`Name: ${agent.name}`));
        console.log(chalk.gray(`Type: ${agent.type}`));
      } catch (error) {
        spinner.fail('Failed to save agent');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}

function createShowCommand() {
  return new Command('show')
    .description('Show details of a specific agent')
    .argument('<key>', 'Agent key')
    .action(async (key) => {
      const spinner = ora('Loading agent...').start();
      
      try {
        const db = getDatabase();
        const agentService = new AgentService(db);
        
        const agent = await agentService.getAgent(key);
        
        spinner.stop();
        
        if (!agent) {
          console.log(chalk.yellow(`Agent "${key}" not found`));
          return;
        }
        
        console.log(chalk.cyan(`\n🤖 Agent: ${agent.key}\n`));
        console.log(JSON.stringify({
          name: agent.name,
          type: agent.type,
          description: agent.description,
          model: agent.model,
          temperature: agent.temperature,
          promptId: agent.promptId,
          maxTokens: agent.maxTokens,
          isActive: agent.isActive,
          isSystemAgent: agent.isSystemAgent,
          averageScore: agent.averageScore,
          evaluationCount: agent.evaluationCount,
        }, null, 2));
      } catch (error) {
        spinner.fail('Failed to load agent');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}

function createUpdateCommand() {
  return new Command('update')
    .description('Update an existing agent')
    .argument('<key>', 'Agent key to update')
    .option('-n, --name <name>', 'Agent display name')
    .option('-d, --description <desc>', 'Agent description')
    .option('-m, --model <model>', 'Model to use')
    .option('-t, --temperature <temp>', 'Temperature setting', parseFloat)
    .option('--max-tokens <n>', 'Maximum tokens', parseInt)
    .option('--active', 'Set agent as active')
    .option('--inactive', 'Set agent as inactive')
    .action(async (key, options) => {
      const spinner = ora('Updating agent...').start();
      
      try {
        const db = getDatabase();
        const agentService = new AgentService(db);
        
        const agent = await agentService.getAgent(key);
        if (!agent) {
          throw new Error(`Agent '${key}' not found`);
        }
        
        const updates: any = {};
        if (options.name) updates.name = options.name;
        if (options.description) updates.description = options.description;
        if (options.model) updates.model = options.model;
        if (options.temperature !== undefined) updates.temperature = options.temperature;
        if (options.maxTokens) updates.maxTokens = options.maxTokens;
        if (options.active) updates.isActive = true;
        if (options.inactive) updates.isActive = false;
        
        const updated = await agentService.saveAgent(key, updates);
        
        spinner.succeed(`Agent "${key}" updated successfully`);
        console.log(chalk.gray(`Name: ${updated.name}`));
        console.log(chalk.gray(`Model: ${updated.model}`));
        console.log(chalk.gray(`Temperature: ${updated.temperature}`));
      } catch (error) {
        spinner.fail('Failed to update agent');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}

function createDeleteCommand() {
  return new Command('delete')
    .description('Delete an agent')
    .argument('<key>', 'Agent key to delete')
    .option('--force', 'Skip confirmation')
    .action(async (key, options) => {
      const spinner = ora('Deleting agent...').start();
      
      try {
        const db = getDatabase();
        const agentService = new AgentService(db);
        
        const agent = await agentService.getAgent(key);
        if (!agent) {
          throw new Error(`Agent '${key}' not found`);
        }
        
        if (agent.isSystemAgent) {
          throw new Error('Cannot delete system agents');
        }
        
        if (!options.force) {
          spinner.stop();
          console.log(chalk.yellow(`\nAbout to delete agent: ${agent.name} (${key})`));
          console.log(chalk.gray('This action cannot be undone.'));
          
          const readline = await import('readline');
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          
          const answer = await new Promise<string>(resolve => {
            rl.question(chalk.cyan('Are you sure? (y/N) '), resolve);
          });
          rl.close();
          
          if (answer.toLowerCase() !== 'y') {
            console.log('Deletion cancelled');
            process.exit(0);
          }
          spinner.start('Deleting agent...');
        }
        
        await agentService.deleteAgent(key);
        
        spinner.succeed(`Agent "${key}" deleted successfully`);
      } catch (error) {
        spinner.fail('Failed to delete agent');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}


function createCloneCommand() {
  return new Command('clone')
    .description('Clone an existing agent')
    .argument('<source>', 'Source agent key')
    .argument('<target>', 'Target agent key')
    .option('--output-type <type>', 'Override output type (structured or text)')
    .action(async (source, target, options) => {
      const spinner = ora('Cloning agent...').start();
      
      try {
        const db = getDatabase();
        const { AgentRepository } = await import('../../repositories/agent.repository.js');
        const agentRepo = new AgentRepository(db);
        const agentService = new AgentService(db);
        
        // Get source agent
        const sourceAgent = await agentService.getAgent(source);
        if (!sourceAgent) {
          throw new Error(`Source agent "${source}" not found`);
        }
        
        // Create clone with overrides
        const clonedData = {
          ...sourceAgent,
          key: target,
          name: `${sourceAgent.name} (Clone)`,
          isDefault: false,
          evaluationCount: 0,
          averageScore: null,
          lastEvaluatedAt: null,
        };
        if (options.outputType) {
          clonedData.outputType = options.outputType;
        }
        
        delete (clonedData as any).id;
        delete (clonedData as any).createdAt;
        delete (clonedData as any).updatedAt;
        
        const cloned = await agentRepo.create(clonedData);
        
        spinner.succeed(`Agent cloned from "${source}" to "${target}"`);
        console.log(chalk.gray(`Name: ${cloned.name}`));
        console.log(chalk.gray(`Type: ${cloned.type}`));
        console.log(chalk.gray(`Model: ${cloned.model}, Temperature: ${cloned.temperature}`));
      } catch (error) {
        spinner.fail('Failed to clone agent');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}

function createVersionCommand() {
  return new Command('version')
    .description('Create a new version of an agent')
    .argument('<key>', 'Agent key')
    .option('-m, --model <model>', 'New model')
    .option('-t, --temperature <temp>', 'New temperature', parseFloat)
    .option('--max-tokens <tokens>', 'New max tokens', parseInt)
    .option('--prompt-id <id>', 'New prompt ID')
    .option('-r, --reason <reason>', 'Reason for creating new version')
    .action(async (key, options) => {
      const spinner = ora('Creating new agent version...').start();
      
      try {
        const db = getDatabase();
        const agentService = new AgentService(db);
        
        // Check if agent exists
        const agent = await agentService.getAgent(key);
        if (!agent) {
          throw new Error(`Agent "${key}" not found`);
        }
        
        // Create new version
        const updatedAgent = await agentService.createAgentVersion(key, {
          model: options.model,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          promptId: options.promptId,
          improvementReason: options.reason || 'Manual version update',
        });
        
        spinner.succeed(`Agent "${key}" updated to version ${updatedAgent.version}`);
        console.log(chalk.gray(`Previous version: ${agent.version}`));
        console.log(chalk.gray(`New version: ${updatedAgent.version}`));
        
        if (options.model) {
          console.log(chalk.gray(`Model: ${agent.model} → ${updatedAgent.model}`));
        }
        if (options.temperature !== undefined) {
          console.log(chalk.gray(`Temperature: ${agent.temperature} → ${updatedAgent.temperature}`));
        }
        if (options.maxTokens) {
          console.log(chalk.gray(`Max Tokens: ${agent.maxTokens || 'default'} → ${updatedAgent.maxTokens}`));
        }
        if (options.promptId) {
          console.log(chalk.gray(`Prompt: ${agent.promptId} → ${updatedAgent.promptId}`));
        }
      } catch (error) {
        spinner.fail('Failed to create agent version');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}

function createHistoryCommand() {
  return new Command('history')
    .description('Show version history for an agent')
    .argument('<key>', 'Agent key')
    .option('-l, --limit <n>', 'Limit number of versions shown', parseInt, 10)
    .action(async (key, options) => {
      const spinner = ora('Loading version history...').start();
      
      try {
        const db = getDatabase();
        const agentService = new AgentService(db);
        
        // Get current agent
        const agent = await agentService.getAgent(key);
        if (!agent) {
          throw new Error(`Agent "${key}" not found`);
        }
        
        // Get version history
        const versions = await agentService.getAgentVersionHistory(key);
        
        spinner.stop();
        
        console.log(chalk.cyan(`\n📊 Version History for "${key}":\n`));
        console.log(chalk.bold(`Current Version: ${agent.version}`));
        console.log();
        
        const displayVersions = options.limit ? versions.slice(0, options.limit) : versions;
        
        for (const version of displayVersions) {
          console.log(chalk.bold(`Version ${version.version}`) + chalk.gray(` (${new Date(version.createdAt).toLocaleString()})`));
          
          if (version.improvementReason) {
            console.log(`  Reason: ${version.improvementReason}`);
          }
          
          console.log(`  Model: ${version.model}, Temp: ${version.temperature}`);
          
          if (version.averageScore !== null) {
            console.log(`  Score: ${version.averageScore.toFixed(3)} (${version.evaluationCount} evals)`);
          }
          
          if (version.changesMade) {
            const changes = [];
            if (version.changesMade.model) changes.push('model');
            if (version.changesMade.temperature) changes.push('temperature');
            if (version.changesMade.maxTokens) changes.push('maxTokens');
            if (version.changesMade.prompt) changes.push('prompt');
            if (version.changesMade.outputSchema) changes.push('schema');
            if (changes.length > 0) {
              console.log(`  Changes: ${changes.join(', ')}`);
            }
          }
          console.log();
        }
        
        if (versions.length > displayVersions.length) {
          console.log(chalk.gray(`... and ${versions.length - displayVersions.length} more versions`));
        }
      } catch (error) {
        spinner.fail('Failed to load version history');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}

function createRollbackCommand() {
  return new Command('rollback')
    .description('Rollback an agent to a previous version')
    .argument('<key>', 'Agent key')
    .argument('<version>', 'Target version number', parseInt)
    .option('-r, --reason <reason>', 'Reason for rollback')
    .option('-f, --force', 'Skip confirmation')
    .action(async (key, targetVersion, options) => {
      const spinner = ora('Preparing rollback...').start();
      
      try {
        const db = getDatabase();
        const agentService = new AgentService(db);
        
        // Get current agent
        const agent = await agentService.getAgent(key);
        if (!agent) {
          throw new Error(`Agent "${key}" not found`);
        }
        
        spinner.stop();
        
        // Confirm rollback
        if (!options.force) {
          console.log(chalk.yellow('\n⚠️  Warning: Rolling back agent version'));
          console.log(chalk.gray(`Current version: ${agent.version}`));
          console.log(chalk.gray(`Target version: ${targetVersion}`));
          console.log(chalk.gray('A new version will be created with the configuration from the target version.'));
          
          const readline = await import('readline');
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          
          const answer = await new Promise<string>(resolve => {
            rl.question(chalk.cyan('Proceed with rollback? (y/N) '), resolve);
          });
          rl.close();
          
          if (answer.toLowerCase() !== 'y') {
            console.log('Rollback cancelled');
            process.exit(0);
          }
        }
        
        spinner.start('Rolling back agent...');
        
        // Perform rollback
        const rolledBackAgent = await agentService.rollbackAgent(key, targetVersion);
        
        spinner.succeed(`Agent "${key}" rolled back to configuration from version ${targetVersion}`);
        console.log(chalk.gray(`New version created: ${rolledBackAgent.version}`));
        console.log(chalk.gray(`Model: ${rolledBackAgent.model}`));
        console.log(chalk.gray(`Temperature: ${rolledBackAgent.temperature}`));
        console.log(chalk.gray(`Prompt: ${rolledBackAgent.promptId}`));
      } catch (error) {
        spinner.fail('Failed to rollback agent');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}