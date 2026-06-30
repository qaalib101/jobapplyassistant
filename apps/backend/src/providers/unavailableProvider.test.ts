import { describe, it, expect, vi } from 'vitest';
import { UnavailableProvider } from './unavailableProvider';

describe('UnavailableProvider', () => {
  it('should be properly initialized with correct properties', () => {
    const provider = new UnavailableProvider('test-provider', 'Test reason');
    
    expect(provider.id).toBe('test-provider');
    expect(provider.label).toBe('test-provider unavailable');
    expect(provider.mode).toBe('disabled');
  });

  it('should report as not configured', () => {
    const provider = new UnavailableProvider('test-provider', 'Test reason');
    
    expect(provider.configured()).toBe(false);
  });

  it('should fail health check', async () => {
    const provider = new UnavailableProvider('test-provider', 'Test reason');
    
    expect(await provider.healthCheck()).toBe(false);
  });

  it('should throw error when generating answer draft', async () => {
    const provider = new UnavailableProvider('test-provider', 'Test reason');
    
    await expect(provider.generateAnswerDraft({
      field: { fieldId: 'field1', type: 'text' },
      question: 'Question 1',
      context: 'Some context',
      jobDescription: 'Job description'
    })).rejects.toThrow('Test reason');
  });

  it('should throw error when generating answer drafts', async () => {
    const provider = new UnavailableProvider('test-provider', 'Test reason');
    
    await expect(provider.generateAnswerDrafts({
      fields: [{ field: { fieldId: 'field1', type: 'text' }, question: 'Question 1' }],
      context: 'Some context',
      jobDescription: 'Job description'
    })).rejects.toThrow('Test reason');
  });

  it('should throw error when tailoring resume', async () => {
    const provider = new UnavailableProvider('test-provider', 'Test reason');
    
    await expect(provider.tailorResume({
      resumeText: 'My resume',
      jobDescription: 'Job description',
      userContext: 'User context'
    })).rejects.toThrow('Test reason');
  });
});