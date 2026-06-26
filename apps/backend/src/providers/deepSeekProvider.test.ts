import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeepSeekProvider } from './deepSeekProvider';
import type { BatchAnswerInput, DraftAnswerInput } from '../types';

// Mock global fetch
const mockFetch = vi.fn();
vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch);

// Mock the config and extractJsonObject
vi.mock('../config', () => ({
  config: {
    deepseek: {
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      apiKey: 'test-api-key'
    },
    aiTimeoutMs: 10000
  }
}));

vi.mock('./json', () => ({
  extractJsonObject: vi.fn()
}));

describe('DeepSeekProvider', () => {
  let provider: DeepSeekProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new DeepSeekProvider();
  });

  it('should be properly initialized with correct properties', () => {
    expect(provider.id).toBe('deepseek');
    expect(provider.label).toBe('DeepSeek');
    expect(provider.mode).toBe('remote');
  });

  it('should report as configured when API key is set', () => {
    expect(provider.configured()).toBe(true);
  });

  it('should pass health check when configured', async () => {
    const mockResponse = { ok: true };
    mockFetch.mockResolvedValue(mockResponse as any);

    expect(await provider.healthCheck()).toBe(true);
  });

  it('should fail health check when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    expect(await provider.healthCheck()).toBe(false);
  });

  it('should generate answer draft successfully', async () => {
    const jsonModule = await import('./json');
    vi.mocked(jsonModule.extractJsonObject).mockResolvedValue({
      answers: [
        {
          fieldId: 'field1',
          answer: 'Mock answer text',
          confidence: 0.8,
          sourceContext: { contextUsed: 'test' },
          needsReview: true,
          reasoningSummary: 'Test summary'
        }
      ]
    });

    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ choices: [{ message: { content: '{ "answers": [] }' } }] })
    };
    mockFetch.mockResolvedValue(mockResponse as any);

    const input: DraftAnswerInput = {
      question: 'Tell me about yourself',
      field: { fieldId: 'field1', type: 'text' },
      context: 'Some context here'
    };

    const result = await provider.generateAnswerDraft(input);

    expect(result).toBeDefined();
    expect(result.text).toBe('Mock answer text');
    expect(result.confidence).toBe(0.8);
    expect(result.provider).toBe('deepseek');
    expect(result.model).toBe('deepseek-chat');
  });

  it('should generate batch answer drafts successfully', async () => {
    const jsonModule = await import('./json');
    vi.mocked(jsonModule.extractJsonObject).mockResolvedValue({
      answers: [
        {
          fieldId: 'field1',
          answer: 'Mock answer text 1',
          confidence: 0.8,
          sourceContext: { contextUsed: 'test' },
          needsReview: true,
          reasoningSummary: 'Test summary'
        },
        {
          fieldId: 'field2',
          answer: 'Mock answer text 2',
          confidence: 0.7,
          sourceContext: { contextUsed: 'test' },
          needsReview: true,
          reasoningSummary: 'Test summary'
        }
      ]
    });

    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ choices: [{ message: { content: '{ "answers": [] }' } }] })
    };
    mockFetch.mockResolvedValue(mockResponse as any);

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
    expect(result[0].text).toBe('Mock answer text 1');
    expect(result[1].text).toBe('Mock answer text 2');
    expect(result[0].confidence).toBe(0.8);
    expect(result[1].confidence).toBe(0.7);
    expect(result[0].provider).toBe('deepseek');
    expect(result[1].provider).toBe('deepseek');
    expect(result[0].model).toBe('deepseek-chat');
    expect(result[1].model).toBe('deepseek-chat');
  });

  it('should tailor resume successfully', async () => {
    const jsonModule = await import('./json');
    vi.mocked(jsonModule.extractJsonObject).mockResolvedValue({
      tailoredResume: 'Tailored resume text here',
      confidence: 0.85,
      sourceContext: { contextUsed: 'resume_job_description_uploaded_context' }
    });

    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ choices: [{ message: { content: '{ "tailoredResume": "" }' } }] })
    };
    mockFetch.mockResolvedValue(mockResponse as any);

    const input = {
      resumeText: 'My resume text here',
      jobDescription: 'Job description here',
      userContext: 'User context here'
    };

    const result = await provider.tailorResume(input);

    expect(result).toBeDefined();
    expect(result.text).toBe('Tailored resume text here');
    expect(result.confidence).toBe(0.85);
    expect(result.provider).toBe('deepseek');
    expect(result.model).toBe('deepseek-chat');
  });
});