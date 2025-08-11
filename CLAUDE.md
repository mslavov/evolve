# Atlas Integration Platform - Development Workflow

## 🚀 MANDATORY WORKFLOW - Follow this sequence for EVERY task:

### 1️⃣ START: Read Project Rules
**FIRST**, read ALL rule files in `.claude/rules/` folder to understand:
- Build and compilation requirements
- Tech stack specifications  
- Architecture patterns
- Environment configuration
- API endpoints
- Debugging approaches

### 2️⃣ UNDERSTAND: Read Documentation
**SECOND**, start from `docs/index.md` and read relevant documentation to:
- Understand the system architecture
- Review existing implementations
- Check component relationships
- Identify patterns and conventions

### 3️⃣ IMPLEMENT: Complete the Task
**THIRD**, implement the requested changes while:
- Following all rules from `.claude/rules/`
- Maintaining consistency with existing patterns
- Running build checks after changes
- Testing functionality

### 4️⃣ FINISH: Update Documentation
**FINALLY**, after completing the task:
- Review all changes made to the codebase
- Check if documentation reflects the changes
- Update relevant documentation files if needed
- Ensure docs remain accurate and helpful

## ⚠️ CRITICAL REMINDERS

### Documentation Synchronization
- **ALWAYS** update documentation after code changes
- Documentation lives in `docs/` directory
- Keep technical details accurate
- Update examples if APIs change
- Document new features or components

### Quality Checks
Before marking any task complete:
1. ✅ All rules in `.claude/rules/` followed
2. ✅ Build passes without errors (`pnpm build`)
3. ✅ Linting passes (`pnpm lint`)
4. ✅ Tests pass (if applicable)
5. ✅ Documentation is current and accurate

## Project Overview
Atlas is an integration platform that unifies data from GitHub, Notion, Jira, and other systems into a temporal knowledge graph using Zep Cloud.

For detailed information about:
- **Project rules**: See `.claude/rules/` directory
- **Technical documentation**: Start from `docs/index.md`
- **API references**: Check `docs/api/` directory
- **Architecture details**: Review `docs/architecture/` directory