import { config } from '../config';
import { LanguageDetectionResult } from '../types';
import { normalizeWhitespace, isMostlySymbolsOrNumbers } from '../utils/helpers';

// fasttext.js types
interface FastTextModel {
  predict(text: string, k?: number): Promise<Array<{ label: string; value: number }>>;
}

let model: FastTextModel | null = null;
let modelLoadError: Error | null = null;

/**
 * Initialize the language detection model
 */
export async function initLanguageDetector(): Promise<void> {
  try {
    // Dynamic import for fasttext.js
    const FastText = await import('fasttext.js');
    const ft = new FastText.default();

    await ft.loadModel(config.languageDetection.modelPath);
    model = ft;

    console.info('Language detection model loaded successfully');
  } catch (error) {
    modelLoadError = error as Error;
    console.error('Failed to load language detection model:', error);
    throw error;
  }
}

/**
 * Check if the language detector is available
 */
export function isDetectorAvailable(): boolean {
  return model !== null;
}

/**
 * Get the model load error if any
 */
export function getModelError(): Error | null {
  return modelLoadError;
}

/**
 * Detect the language of a given text
 */
export async function detectLanguage(text: string): Promise<LanguageDetectionResult> {
  // Handle edge cases
  if (!text || text.trim().length === 0) {
    return {
      lang: 'und',
      confidence: 0,
      isReliable: false,
    };
  }

  const normalizedText = normalizeWhitespace(text);

  // Check minimum character threshold
  if (normalizedText.length < config.languageDetection.minChars) {
    return {
      lang: 'und',
      confidence: 0,
      isReliable: false,
    };
  }

  // Check if text is mostly symbols/numbers
  if (isMostlySymbolsOrNumbers(normalizedText)) {
    return {
      lang: 'und',
      confidence: 0,
      isReliable: false,
    };
  }

  // If model not available, return unknown
  if (!model) {
    console.warn('Language detection model not available');
    return {
      lang: 'und',
      confidence: 0,
      isReliable: false,
    };
  }

  try {
    // Truncate text for efficiency (fastText works well on shorter text)
    const truncatedText = normalizedText.substring(0, 1000);

    // Get prediction
    const predictions = await model.predict(truncatedText, 1);

    if (!predictions || predictions.length === 0) {
      return {
        lang: 'und',
        confidence: 0,
        isReliable: false,
      };
    }

    const prediction = predictions[0];
    // fastText labels are in format "__label__xx"
    const lang = prediction.label.replace('__label__', '');
    const confidence = prediction.value;

    return {
      lang,
      confidence,
      isReliable: confidence >= config.languageDetection.confidenceThreshold,
    };
  } catch (error) {
    console.error('Language detection error:', error);
    return {
      lang: 'und',
      confidence: 0,
      isReliable: false,
    };
  }
}

/**
 * Detect languages for multiple texts
 */
export async function detectLanguageBatch(
  texts: string[]
): Promise<LanguageDetectionResult[]> {
  return Promise.all(texts.map(detectLanguage));
}

/**
 * Map language codes to common formats
 * fastText uses ISO 639-1 codes, but some APIs might need different formats
 */
export function normalizeLanguageCode(code: string): string {
  // Common mappings
  const mappings: Record<string, string> = {
    'zh': 'zh-CN',
    'zh-cn': 'zh-CN',
    'zh-tw': 'zh-TW',
    'pt': 'pt-PT',
    'pt-br': 'pt-BR',
  };

  const lower = code.toLowerCase();
  return mappings[lower] || code.toLowerCase();
}

/**
 * Get the ISO 639-1 language code (2 letter) from various formats
 */
export function getISO6391Code(code: string): string {
  // Handle codes like "en-US", "zh-CN"
  return code.split('-')[0].toLowerCase();
}
