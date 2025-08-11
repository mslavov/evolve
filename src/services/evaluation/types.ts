export type EvaluationStrategyType = 'numeric' | 'fact-based' | 'hybrid' | 'custom';

export type AggregationMethod = 'weighted' | 'voting' | 'ensemble';

export type FeedbackVerbosity = 'minimal' | 'standard' | 'detailed';

export interface EvaluationContext {
  taskType?: string;
  hasNumericGroundTruth: boolean;
  hasTextualContent: boolean;
  hasFactRequirements: boolean;
  dataType?: string;
  sampleSize?: number;
}

export interface EvaluationConfig {
  strategy?: string;
  autoSelect?: boolean;
  combineStrategies?: {
    strategies: string[];
    aggregation: AggregationMethod;
    weights?: number[];
  };
  customMetrics?: MetricDefinition[];
  feedbackDetail: FeedbackVerbosity;
}

export interface MetricDefinition {
  name: string;
  description: string;
  calculate: (predictions: any[], groundTruth: any[]) => number;
}

export interface EvaluationResult {
  score: number;
  metrics?: Record<string, number>;
  details?: any[];
  factResults?: FactCheckResult[];
  missingFacts?: string[];
  numericAnalysis?: any;
  factAnalysis?: any;
  insights?: string[];
  clauseAnalysis?: any;
  risks?: string[];
  recommendations?: string[];
}

export interface DetailedEvaluation {
  score: number;
  evaluationMethod: string;
  results: EvaluationResult;
  patterns: FailurePattern[];
  feedback: DetailedFeedback;
}

export interface FailurePattern {
  type: string;
  frequency: number;
  examples: EvaluationExample[];
  suggestedFix: string;
  evaluatorSource: string;
}

export interface EvaluationExample {
  input: any;
  expected: any;
  actual: any;
  error?: string;
}

export interface DetailedFeedback {
  summary: string;
  strengths?: string[];
  weaknesses?: string[];
  patterns?: string[];
  actionItems?: string[];
  missingClauses?: string[];
  risks?: string[];
  improvements?: string[];
}

export interface FactDefinition {
  name: string;
  description: string;
  required?: boolean;
  validate?: (response: string) => boolean;
}

export interface RequiredFacts {
  facts: FactDefinition[];
  context?: string;
}

export interface FactCheckResult {
  factName: string;
  present: boolean;
  confidence?: number;
  evidence?: string;
}

export interface CodeRequirements {
  patterns?: string[];
  antiPatterns?: string[];
  mustInclude?: string[];
  mustNotInclude?: string[];
  complexityLimit?: number;
}

export interface LegalRequirements {
  clauses: string[];
  template?: string;
  jurisdiction?: string;
}

export interface EvaluationRule {
  name: string;
  priority?: number;
  matches: (context: EvaluationContext) => boolean;
  strategyName: string;
}

export interface ResearchInsight {
  source: string;
  strategy: string;
  description: string;
  confidence: number;
  applicability: number;
  implementation?: string;
}

export interface OptimizationState {
  currentConfig: any;
  iterationCount: number;
  score: number;
  feedback: DetailedFeedback;
  improvementHistory: ImprovementStep[];
  researchFindings: ResearchInsight[];
  convergenceMetrics?: {
    scoreImprovement: number;
    consecutiveNoImprovement: number;
    averageImprovement: number;
  };
}

export interface ImprovementStep {
  iteration: number;
  config: any;
  score: number;
  improvement: number;
  strategies: string[];
  feedback: DetailedFeedback;
  timestamp: Date;
}