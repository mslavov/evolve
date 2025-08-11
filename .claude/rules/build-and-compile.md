# Build and Compilation Rules

## CRITICAL: Always Compile After Code Changes
**EVERY TIME you make code changes, you MUST:**
1. Run `pnpm build` to check for TypeScript errors
2. Fix any compilation errors before proceeding
3. Fix any ESLint warnings that could break the build

## Build Commands
```bash
# Check if code compiles
pnpm build

# Run development server (also shows compilation errors)
pnpm dev

# Type check only (faster than full build)
pnpm exec tsc --noEmit

# Fix linting issues
pnpm lint
pnpm lint:fix
```

## Common Build Issues and Fixes
1. **TypeScript `any` type errors**: 
   - Either specify proper types or add `/* eslint-disable @typescript-eslint/no-explicit-any */` at the top of the file
   
2. **Unused variables**: 
   - Remove unused imports and variables or prefix with underscore if intentionally unused

3. **Missing dependencies**: 
   - Always run `pnpm install` after modifying package.json

## Testing Checklist
Before considering any task complete:
- [ ] Run `pnpm build` - MUST pass without errors
- [ ] Run `pnpm lint` - Fix any errors
- [ ] Test the main functionality that was changed
- [ ] Check that environment variables are set correctly
- [ ] Verify API endpoints return expected responses