import * as deepl from 'deepl-node';
import { Translator } from './translator.interface';
import { TranslationResult, TranslationError } from '../types';
import { config } from '../config';
import { retry } from '../utils/helpers';

/**
 * DeepL translation provider adapter
 */
export class DeepLTranslator implements Translator {
  readonly name = 'deepl';
  private client: deepl.Translator | null = null;
  private supportedLanguages: string[] = [];

  constructor() {
    if (config.translation.deepl.apiKey) {
      this.client = new deepl.Translator(config.translation.deepl.apiKey);
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async translate(
    text: string,
    sourceLang: string,
    targetLang: string
  ): Promise<TranslationResult> {
    if (!this.client) {
      throw new TranslationError('DeepL API key not configured');
    }

    try {
      const result = await retry(async () => {
        const response = await this.client!.translateText(
          text,
          this.mapSourceLang(sourceLang),
          this.mapTargetLang(targetLang),
          {
            preserveFormatting: true,
          }
        );
        return response;
      });

      return {
        text: result.text,
        detectedSourceLang: result.detectedSourceLang?.toLowerCase(),
      };
    } catch (error) {
      if (error instanceof deepl.DeepLError) {
        throw new TranslationError(`DeepL error: ${error.message}`);
      }
      throw error;
    }
  }

  async translateBatch(
    texts: string[],
    sourceLang: string,
    targetLang: string
  ): Promise<TranslationResult[]> {
    if (!this.client) {
      throw new TranslationError('DeepL API key not configured');
    }

    try {
      const results = await retry(async () => {
        const responses = await this.client!.translateText(
          texts,
          this.mapSourceLang(sourceLang),
          this.mapTargetLang(targetLang),
          {
            preserveFormatting: true,
          }
        );
        return responses;
      });

      return results.map((r) => ({
        text: r.text,
        detectedSourceLang: r.detectedSourceLang?.toLowerCase(),
      }));
    } catch (error) {
      if (error instanceof deepl.DeepLError) {
        throw new TranslationError(`DeepL error: ${error.message}`);
      }
      throw error;
    }
  }

  async getSupportedLanguages(): Promise<string[]> {
    if (this.supportedLanguages.length > 0) {
      return this.supportedLanguages;
    }

    if (!this.client) {
      return [];
    }

    try {
      const [source, target] = await Promise.all([
        this.client.getSourceLanguages(),
        this.client.getTargetLanguages(),
      ]);

      const languages = new Set<string>();
      source.forEach((lang) => languages.add(lang.code.toLowerCase()));
      target.forEach((lang) => languages.add(lang.code.toLowerCase()));

      this.supportedLanguages = Array.from(languages);
      return this.supportedLanguages;
    } catch (error) {
      console.error('Failed to get DeepL languages:', error);
      return [];
    }
  }

  /**
   * Map language codes to DeepL source language format
   */
  private mapSourceLang(lang: string): deepl.SourceLanguageCode | null {
    if (lang === 'und' || lang === 'auto') {
      return null; // Let DeepL auto-detect
    }

    const mapping: Record<string, deepl.SourceLanguageCode> = {
      'en': 'en',
      'de': 'de',
      'fr': 'fr',
      'es': 'es',
      'pt': 'pt',
      'it': 'it',
      'nl': 'nl',
      'pl': 'pl',
      'ru': 'ru',
      'ja': 'ja',
      'zh': 'zh',
      'ko': 'ko',
    };

    return mapping[lang.toLowerCase().split('-')[0]] || (lang as deepl.SourceLanguageCode);
  }

  /**
   * Map language codes to DeepL target language format
   */
  private mapTargetLang(lang: string): deepl.TargetLanguageCode {
    const mapping: Record<string, deepl.TargetLanguageCode> = {
      'en': 'en-US',
      'en-us': 'en-US',
      'en-gb': 'en-GB',
      'de': 'de',
      'fr': 'fr',
      'es': 'es',
      'pt': 'pt-PT',
      'pt-br': 'pt-BR',
      'it': 'it',
      'nl': 'nl',
      'pl': 'pl',
      'ru': 'ru',
      'ja': 'ja',
      'zh': 'zh-hans',
      'ko': 'ko',
    };

    return mapping[lang.toLowerCase()] || (lang as deepl.TargetLanguageCode);
  }
}
