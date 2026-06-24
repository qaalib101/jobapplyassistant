import { AIProvider, BatchAnswerInput, BatchAnswerResult, DraftAnswerInput, DraftAnswerResult } from "../types";

/**
 * Base class for all AI providers to implement common functionality
 */
export abstract class BaseProvider implements AIProvider {
  id: string;
  label: string;
  mode: 'local' | 'remote' | 'disabled';
  
  constructor(id: string, label: string, mode: 'local' | 'remote' | 'disabled') {
    this.id = id;
    this.label = label;
    this.mode = mode;
  }

  /**
   * Check if provider is properly configured
   */
  abstract configured(): boolean;

  /**
   * Perform health check for the provider
   */
  async healthCheck(): Promise<boolean> {
    return this.configured();
  }

  /**
   * Generate a single answer draft (default implementation using batch method)
   */
  async generateAnswerDraft(input: DraftAnswerInput): Promise<DraftAnswerResult> {
    const batch = await this.generateAnswerDrafts({
      fields: [{ field: input.field, question: input.question }],
      context: input.context,
      jobDescription: input.jobDescription,
    });
    const first = batch[0];
    if (!first) throw new Error(`${this.label} did not return answer.`);
    return {
      text: first.text,
      confidence: first.confidence,
      sourceContext: first.sourceContext,
      provider: first.provider,
      model: first.model,
    };
  }

  /**
   * Generate multiple answer drafts (must be implemented by subclasses)
   */
  abstract generateAnswerDrafts(input: BatchAnswerInput): Promise<BatchAnswerResult[]>;

  /**
   * Tailor resume for a specific job description (default implementation)
   * This can be overridden by providers that support it
   */
  async tailorResume(input: {
    resumeText: string;
    jobDescription: string;
    userContext: string;
  }): Promise<DraftAnswerResult> {
    throw new Error(`${this.label} does not support resume tailoring`);
  }
}