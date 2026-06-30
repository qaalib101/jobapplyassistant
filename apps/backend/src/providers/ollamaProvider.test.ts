import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaProvider } from './ollamaProvider';
import type { BatchAnswerInput, DraftAnswerInput } from '../types';

// Mock global fetch
const mockFetch = vi.fn();
vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch);

// Mock the config and extractJsonObject
vi.mock('../config', () => ({
  config: {
    ollama: {
      baseUrl: 'http://localhost:11434',
      model: 'llama3'
    },
    aiTimeoutMs: 10000
  }
}));

vi.mock('./json', () => ({
  extractJsonObject: vi.fn()
}));

describe('OllamaProvider', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OllamaProvider();
  });

  it('should be properly initialized with correct properties', () => {
    expect(provider.id).toBe('ollama');
    expect(provider.label).toBe('Ollama');
    expect(provider.mode).toBe('local');
  });

  it('should report as configured when base URL and model are set', () => {
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

  it('should generate batch answer drafts successfully', async () => {
    const jsonModule = await import('./json');
    vi.mocked(jsonModule.extractJsonObject).mockReturnValue({
      answers: [
        {
          fieldId: 'field1',
          answer: 'Mock answer text 1',
          confidence: 0.8,
          sourceContext: { contextUsed: 'test' },
          needsReview: true
        },
        {
          fieldId: 'field2',
          answer: 'Mock answer text 2',
          confidence: 0.7,
          sourceContext: { contextUsed: 'test' },
          needsReview: true
        }
      ]
    });

    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ response: 'mock response content' })
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
    expect(result[0].provider).toBe('ollama');
    expect(result[1].provider).toBe('ollama');
    expect(result[0].model).toBe('llama3');
    expect(result[1].model).toBe('llama3');
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
      json: vi.fn().mockResolvedValue({ response: 'Tailored resume text here' })
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
    expect(result.confidence).toBe(0.52);
    expect(result.provider).toBe('ollama');
    expect(result.model).toBe('llama3');
  });
});