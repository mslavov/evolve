# MCP Server Usage Rules

## Available MCP Servers

The project has the following MCP servers configured:

1. **context7** (`@upstash/context7-mcp`)
   - Purpose: Context management and retrieval
   - Use this for managing and accessing project context information

2. **mastra-docs** (`@mastra/mcp-docs-server`)
   - Purpose: provides direct access to Mastra’s complete knowledge
   - It has access to documentation, code examples, technical blog posts / feature announcements, and package changelogs which your IDE can read to help you build with Mastra.


## MCP Server Usage Guidelines

1. **Always check server availability**: Before using an MCP server, verify it's
   enabled in the environment
2. **Use appropriate server for the task**: Choose the MCP server that best
   matches your task requirements
3. **Follow server documentation**: Each MCP server has specific capabilities
   and limitations - consult their documentation
4. **Error handling**: Always handle potential failures when using MCP servers
   gracefully
