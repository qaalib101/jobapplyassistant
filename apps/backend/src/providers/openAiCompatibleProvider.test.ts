import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAiCompatibleProvider } from './openAiCompatibleProvider';
import { extractJsonObject } from './json';

// Mock global fetch
const mockFetch = vi.fn();
vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch);

// Mock the extractJsonObject function
vi.mock('./json', () => ({
  extractJsonObject: vi.fn(),
}));

describe('OpenAiCompatibleProvider', () => {
  const mockOptions = {
    id: 'deepseek' as 'deepseek' | 'openai',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'test-api-key',
    model: 'deepseek-chat'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be properly initialized with correct properties', () => {
    const provider = new OpenAiCompatibleProvider(mockOptions);
    
    expect(provider.id).toBe('deepseek');
    expect(provider.label).toBe('DeepSeek');
    expect(provider.mode).toBe('remote');
  });

  it('should report as configured when API key is provided', () => {
    const provider = new OpenAiCompatibleProvider(mockOptions);
    
    expect(provider.configured()).toBe(true);
  });

  it('should report as not configured when API key is not provided', () => {
    const provider = new OpenAiCompatibleProvider({
      ...mockOptions,
      apiKey: undefined
    });
    
    expect(provider.configured()).toBe(false);
  });

  it('should throw error when generating answer drafts without API key', async () => {
    const provider = new OpenAiCompatibleProvider({
      ...mockOptions,
      apiKey: undefined
    });
    
    await expect(provider.generateAnswerDrafts({
      fields: [{ field: { fieldId: 'field1', type: 'text' }, question: 'Question 1' }],
      context: 'Some context',
      jobDescription: 'Job description'
    })).rejects.toThrow('DeepSeek API key is not configured.');
  });

  it('should generate answer drafts successfully when API call succeeds', async () => {
    vi.mocked(extractJsonObject).mockReturnValue({
      answers: [
        {
          fieldId: 'field1',
          answer: 'Test answer',
          confidence: 0.8,
          sourceContext: { contextUsed: 'test_context' },
          needsReview: true
        }
      ]
    });

    const provider = new OpenAiCompatibleProvider(mockOptions);

    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              answers: [
                {
                  fieldId: 'field1',
                  answer: 'Test answer',
                  confidence: 0.8,
                  sourceContext: { contextUsed: 'test_context' },
                  needsReview: true
                }
              ]
            })
          }
        }]
      })
    });

    const result = await provider.generateAnswerDrafts({
      fields: [{ field: { fieldId: 'field1', type: 'text' }, question: 'Question 1' }],
      context: 'Some context',
      jobDescription: 'Job description'
    });

    expect(result).toHaveLength(1);
    expect(result[0].fieldId).toBe('field1');
    expect(result[0].text).toBe('Test answer');
    expect(result[0].confidence).toBe(0.8);
    expect(result[0].model).toBe('deepseek-chat');
    expect(result[0].provider).toBe('deepseek');
  });

  it('should handle error when API call fails', async () => {
    const provider = new OpenAiCompatibleProvider(mockOptions);
    
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500
    });

    await expect(provider.generateAnswerDrafts({
      fields: [{ field: { fieldId: 'field1', type: 'text' }, question: 'Question 1' }],
      context: 'Some context',
      jobDescription: 'Job description'
    })).rejects.toThrow('DeepSeek request failed with 500');
  });

  it('should generate tailored resume successfully', async () => {
    const provider = new OpenAiCompatibleProvider(mockOptions);
    
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: 'Tailored resume text'
          }
        }]
      })
    });

    const result = await provider.tailorResume({
      resumeText: 'Original resume',
      jobDescription: 'Job description',
      userContext: 'User context'
    });

    expect(result.text).toBe('Tailored resume text');
    expect(result.confidence).toBe(0.6);
    expect(result.model).toBe('deepseek-chat');
    expect(result.provider).toBe('deepseek');
  });

  it('should handle error when tailoring resume fails', async () => {
    const provider = new OpenAiCompatibleProvider(mockOptions);
    
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500
    });

    await expect(provider.tailorResume({
      resumeText: 'Original resume',
      jobDescription: 'Job description',
      userContext: 'User context'
    })).rejects.toThrow('DeepSeek request failed with 500');
  });

  it('should handle error when API returns no content', async () => {
    const provider = new OpenAiCompatibleProvider(mockOptions);
    
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: ''
          }
        }]
      })
    });

    await expect(provider.generateAnswerDrafts({
      fields: [{ field: { fieldId: 'field1', type: 'text' }, question: 'Question 1' }],
      context: 'Some context',
      jobDescription: 'Job description'
    })).rejects.toThrow('DeepSeek returned no draft text.');
  });

  it('should generate single answer draft successfully', async () => {
    vi.mocked(extractJsonObject).mockReturnValue({
      answers: [
        {
          fieldId: 'field1',
          answer: 'Test answer',
          confidence: 0.8,
          sourceContext: { contextUsed: 'test_context' },
          needsReview: true
        }
      ]
    });

    const provider = new OpenAiCompatibleProvider(mockOptions);

    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              answers: [
                {
                  fieldId: 'field1',
                  answer: 'Test answer',
                  confidence: 0.8,
                  sourceContext: { contextUsed: 'test_context' },
                  needsReview: true
                }
              ]
            })
          }
        }]
      })
    });

    const result = await provider.generateAnswerDraft({
      field: { fieldId: 'field1', type: 'text' },
      question: 'Question 1',
      context: 'Some context',
      jobDescription: 'Job description'
    });

    expect(result.text).toBe('Test answer');
    expect(result.confidence).toBe(0.8);
    expect(result.model).toBe('deepseek-chat');
    expect(result.provider).toBe('deepseek');
  });
});