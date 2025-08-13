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
    .addCommand(createSetCommand())
    .addCommand(createGetCommand())
    .addCommand(createDefaultCommand())
    .addCommand(createSchemasCommand())
    .addCommand(createCloneCommand());
  
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
          const defaultMark = agent.isDefault ? chalk.green(' [DEFAULT]') : '';
          const activeMark = agent.isActive ? '' : chalk.red(' [INACTIVE]');
          const systemMark = agent.isSystemAgent ? chalk.blue(' [SYSTEM]') : '';
          
          console.log(chalk.bold(`${agent.key}${defaultMark}${activeMark}${systemMark}`));
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

function createSetCommand() {
  return new Command('set')
    .description('Create or update an agent')
    .argument('<key>', 'Agent key')
    .option('-n, --name <name>', 'Agent display name')
    .option('--type <type>', 'Agent type (scorer, evaluator, optimizer, researcher, generator)', 'scorer')
    .option('-d, --description <desc>', 'Agent description')
    .option('-m, --model <model>', 'Model to use')
    .option('-t, --temperature <temp>', 'Temperature setting', parseFloat)
    .option('-p, --prompt <version>', 'Prompt version')
    .option('--max-tokens <n>', 'Maximum tokens', parseInt)
    .option('--output-type <type>', 'Output type: structured or text', 'structured')
    .option('--schema <name>', 'Predefined schema name (scoring, classification, extraction, summarization, translation)')
    .option('--schema-file <path>', 'Path to JSON file containing custom schema definition')
    .option('--default', 'Set as default agent', false)
    .action(async (key, options) => {
      const spinner = ora('Saving agent...').start();
      
      try {
        const db = getDatabase();
        const agentService = new AgentService(db);
        
        // Handle schema configuration
        let outputSchema = undefined;
        let schemaVersion = undefined;
        
        if (options.schemaFile) {
          // Load custom schema from file
          const fs = await import('fs/promises');
          const schemaContent = await fs.readFile(options.schemaFile, 'utf-8');
          outputSchema = JSON.parse(schemaContent);
        } else if (options.schema) {
          // Use predefined schema
          schemaVersion = options.schema;
        }
        
        const agent = await agentService.saveAgent(key, {
          name: options.name,
          type: options.type,
          description: options.description,
          model: options.model,
          temperature: options.temperature,
          promptId: options.prompt,
          maxTokens: options.maxTokens,
          outputType: options.outputType,
          outputSchema,
          schemaVersion,
        });
        
        if (options.default) {
          await agentService.setDefaultAgent(key);
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

function createGetCommand() {
  return new Command('get')
    .description('Get a specific agent')
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
          isDefault: agent.isDefault,
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

function createDefaultCommand() {
  return new Command('default')
    .description('Set the default agent')
    .argument('<key>', 'Agent key to set as default')
    .action(async (key) => {
      const spinner = ora('Setting default agent...').start();
      
      try {
        const db = getDatabase();
        const agentService = new AgentService(db);
        
        await agentService.setDefaultAgent(key);
        
        spinner.succeed(`Agent "${key}" set as default`);
      } catch (error) {
        spinner.fail('Failed to set default agent');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}

function createSchemasCommand() {
  return new Command('schemas')
    .description('List available output schemas')
    .action(async () => {
      const spinner = ora('Loading schemas...').start();
      
      try {
        const db = getDatabase();
        const agentService = new AgentService(db);
        
        const schemas = agentService.listSchemas();
        
        spinner.stop();
        
        console.log(chalk.cyan('\n📋 Available Schemas:\n'));
        
        for (const schema of schemas) {
          console.log(chalk.bold(schema.name) + chalk.gray(` v${schema.version}`));
          if (schema.description) {
            console.log(`  ${schema.description}`);
          }
          console.log();
        }
        
        console.log(chalk.gray('\nUse these with: pnpm cli agent set <key> --schema <name>'));
        console.log(chalk.gray('Or provide custom schema: pnpm cli agent set <key> --schema-file <path>'));
      } catch (error) {
        spinner.fail('Failed to load schemas');
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
    .option('--schema <name>', 'Override with predefined schema')
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
        
        if (options.schema) {
          clonedData.schemaVersion = options.schema;
        }
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
        if (cloned.schemaVersion) {
          console.log(chalk.gray(`Schema: ${cloned.schemaVersion}`));
        }
      } catch (error) {
        spinner.fail('Failed to clone agent');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}