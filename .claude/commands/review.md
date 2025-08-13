# Code Review Command

## Usage
```
/review [focus_area]
```

## Description
Performs an in-depth code review of the Evolve codebase, analyzing the architecture, execution flow, and implementation details.

## Parameters
<focus_area> #$ARGUMENTS </focus_area>

## System Prompt

You are performing a comprehensive code review of this codebase. Follow this systematic approach:

### 1. User Journey Analysis
First, identify and document the main user journeys by analyzing:
- Entry points
- User workflows and interactions
- Expected outcomes and outputs

### 2. Execution Flow Mapping
Trace the execution flow for each user journey:
- Command invocation flow
- Service layer interactions
- Database operations
- Agent orchestration patterns

### 3. Depth-First Component Review
For each component in the execution tree, provide:

#### Component Overview
- **Purpose**: What problem does this component solve?
- **Location**: File path and module structure
- **Dependencies**: What does it depend on?
- **Consumers**: What uses this component?

#### Implementation Analysis
- **Design Pattern**: What patterns are employed?
- **Key Methods/Functions**: Core functionality breakdown
- **Data Flow**: How data moves through the component
- **State Management**: How state is handled (if applicable)

#### Code Quality Assessment
- **Strengths**: Well-implemented aspects
- **Concerns**: Potential issues or improvements
- **Technical Debt**: Areas needing refactoring
- **Performance Considerations**: Bottlenecks or optimizations

### 4. Review Structure

Generate a markdown review file with the following structure:

```markdown
# Codebase Review
Date: [Current Date]
Focus: [focus_area or "Full Codebase"]

## Executive Summary
[High-level overview of the codebase state and key findings]

## User Journeys

### Journey 1: [Name]
**Entry Point**: [Command/API]
**Purpose**: [What the user achieves]
**Execution Flow**:
1. Step 1 ’ Component A
2. Step 2 ’ Component B
3. ...

[Repeat for each journey]

## Component Analysis

### Component: [Component Name]
**File**: `path/to/file.ts`
**Type**: [Service/Repository/Command/etc]

#### Purpose
[Detailed explanation of what this component does]

#### Implementation Details
```typescript
// Key code snippets with explanations
```

#### How It Works
[Step-by-step breakdown of the component's operation]

#### Dependencies
- Uses: [List of dependencies]
- Used By: [List of consumers]

#### Assessment
- **Strengths**: [What works well]
- **Areas for Improvement**: [What could be better]
- **Recommendations**: [Specific suggestions]

[Repeat for each component in depth-first order]

## Architecture Patterns

### Pattern: [Pattern Name]
**Usage**: [Where and how it's used]
**Benefits**: [Why this pattern was chosen]
**Considerations**: [Trade-offs or limitations]

## Database Schema Analysis
[Review of database structure, migrations, and data flow]

## Security Considerations
[Security aspects, vulnerabilities, and recommendations]

## Performance Analysis
[Performance bottlenecks, optimization opportunities]

## Testing Coverage
[Test coverage analysis and recommendations]

## Technical Debt Summary
[Consolidated list of technical debt items]

## Recommendations

### Immediate Actions
1. [Critical fixes or improvements]

### Short-term Improvements
1. [1-2 weeks timeframe]

### Long-term Refactoring
1. [Major architectural changes]

## Conclusion
[Summary of findings and overall codebase health]
```

### 5. Review Guidelines

When reviewing code:

1. **Be Constructive**: Focus on improvements, not just problems
2. **Provide Context**: Explain WHY something is an issue
3. **Suggest Solutions**: Offer concrete alternatives
4. **Acknowledge Good Practices**: Highlight well-written code
5. **Consider Trade-offs**: Understand design decisions in context

### 6. Focus Area Handling

If a focus_area is provided:
- Start with components directly related to the focus area
- Trace dependencies and consumers
- Provide deeper analysis of the focused components
- Still maintain context by reviewing related systems

### 7. Comment Integration

When encountering comments in code:
- Include significant TODO/FIXME comments in the review
- Provide context about why the comment exists
- Suggest resolutions for TODO items
- Evaluate if comments accurately describe the code

### 8. Output

Generate a comprehensive review document that:
- Is easy to navigate with clear sections
- Provides actionable insights
- Balances technical detail with readability
- Includes code snippets where helpful
- Prioritizes findings by importance

The review should help developers:
- Understand the codebase quickly
- Identify areas needing attention
- Make informed refactoring decisions
- Maintain and extend the system effectively