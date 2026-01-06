import { TranslationResult } from '../types';

/**
 * Abstract interface for translation providers
 */
export interface Translator {
  /**
   * Provider name identifier
   */
  readonly name: string;

  /**
   * Translate text from source language to target language
   */
  translate(
    text: string,
    sourceLang: string,
    targetLang: string
  ): Promise<TranslationResult>;

  /**
   * Translate multiple texts in batch
   */
  translateBatch(
    texts: string[],
    sourceLang: string,
    targetLang: string
  ): Promise<TranslationResult[]>;

  /**
   * Check if the provider is configured and available
   */
  isAvailable(): boolean;

  /**
   * Get supported language codes
   */
  getSupportedLanguages(): Promise<string[]>;
}

/**
 * Options for translation
 */
export interface TranslateOptions {
  preserveFormatting?: boolean;
  glossary?: { preserve: string[] };
  formality?: 'default' | 'more' | 'less';
}
