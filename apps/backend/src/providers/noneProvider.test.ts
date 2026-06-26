import { describe, it, expect, vi } from 'vitest';
import { NoneProvider } from './noneProvider';
import type { BatchAnswerInput, DraftAnswerInput } from '../types';

describe('NoneProvider', () => {
  const provider = new NoneProvider();
  
  it('should be properly initialized with correct properties', () => {
    expect(provider.id).toBe('none');
    expect(provider.label).toBe('None');
    expect(provider.mode).toBe('disabled');
  });

  it('should report as not configured', () => {
    expect(provider.configured()).toBe(false);
  });

  it('should fail health check', async () => {
    expect(await provider.healthCheck()).toBe(false);
  });

  it('should throw an error when generating a draft answer', async () => {
    const input: DraftAnswerInput = {
      question: 'Tell me about yourself',
      field: { fieldId: 'field1', type: 'text' },
      context: 'Some context here'
    };

    await expect(provider.generateAnswerDraft(input)).rejects.toThrow('No provider configured for field field1');
  });

  it('should return empty results when generating batch answer drafts', async () => {
    const input: BatchAnswerInput = {
      fields: [
        { field: { fieldId: 'field1', type: 'text' }, question: 'Question 1' },
        { field: { fieldId: 'field2', type: 'textarea' }, question: 'Question 2' }
      ],
      context: 'Some context here'
    };

    const result = await provider.generateAnswerDrafts(input);
    
    expect(result).toHaveLength(2);
    expect(result[0].fieldId).toBe('field1');
    expect(result[1].fieldId).toBe('field2');
    expect(result[0].text).toBe('');
    expect(result[1].text).toBe('');
    expect(result[0].confidence).toBe(0);
    expect(result[1].confidence).toBe(0);
    expect(result[0].provider).toBe('none');
    expect(result[1].provider).toBe('none');
    expect(result[0].model).toBeUndefined();
    expect(result[1].model).toBeUndefined();
  });

  it('should throw an error when tailoring resume', async () => {
    const input = {
      resumeText: 'My resume text here',
      jobDescription: 'Job description here',
      userContext: 'User context here'
    };

    await expect(provider.tailorResume(input)).rejects.toThrow('No provider configured for resume tailoring');
  });
});