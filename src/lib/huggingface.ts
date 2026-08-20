/**
 * Enterprise Hugging Face Free AI Models Integration
 * 
 * Direct API bridge using 100% free open-access models on Hugging Face:
 * - Candidate evaluation & ATS resume screening
 * - AI Proctoring vision & audio diagnostics
 * - Employee work style & telemetry analytics
 * - Dynamic token resolution with localStorage & env precedence
 */

import { callFreeHFModel, getHuggingFaceToken, setHuggingFaceToken, clearHuggingFaceToken, HF_FREE_MODELS, ModelDomainKey } from './ai-models';

export { getHuggingFaceToken, setHuggingFaceToken, clearHuggingFaceToken, HF_FREE_MODELS };

export interface HFAIOptions {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  modelDomain?: ModelDomainKey;
  responseFormat?: { type: 'json_object' | 'text' };
}

/**
 * Generate AI evaluation using Hugging Face free models.
 * Automatically handles retries and LRU cache.
 */
export async function callHuggingFaceAI(opts: HFAIOptions): Promise<string> {
  return callFreeHFModel({
    modelDomain: opts.modelDomain || 'EXECUTIVE_INSIGHTS',
    prompt: opts.prompt,
    systemPrompt: opts.systemPrompt,
    temperature: opts.temperature ?? 0.3,
    maxTokens: opts.maxTokens ?? 1500,
    responseFormat: opts.responseFormat
  });
}
