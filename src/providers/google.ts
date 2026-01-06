import { Translator } from './translator.interface';
import { TranslationResult, TranslationError } from '../types';
import { config } from '../config';
import { retry } from '../utils/helpers';

// Google Cloud Translate types
interface GoogleTranslateClient {
  translate(
    text: string | string[],
    options: { from?: string; to: string }
  ): Promise<[string | string[], unknown]>;
  getLanguages(): Promise<[Array<{ code: string; name: string }>]>;
}

/**
 * Google Cloud Translation provider adapter
 */
export class GoogleTranslator implements Translator {
  readonly name = 'google';
  private client: GoogleTranslateClient | null = null;
  private supportedLanguages: string[] = [];
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamic import to avoid errors if credentials aren't configured
      const { Translate } = await import('@google-cloud/translate').then((m) => m.v2);

      this.client = new Translate({
        keyFilename: config.translation.google.credentialsPath || undefined,
      });
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize Google Translate:', error);
      this.client = null;
    }
  }

  isAvailable(): boolean {
    return this.initialized && this.client !== null;
  }

  async translate(
    text: string,
    sourceLang: string,
    targetLang: string
  ): Promise<TranslationResult> {
    await this.init();

    if (!this.client) {
      throw new TranslationError('Google Translate not configured');
    }

    try {
      const result = await retry(async () => {
        const [translation] = await this.client!.translate(text, {
          from: sourceLang === 'und' ? undefined : this.mapLangCode(sourceLang),
          to: this.mapLangCode(targetLang),
        });
        return translation;
      });

      return {
        text: result as string,
        detectedSourceLang: sourceLang === 'und' ? undefined : sourceLang,
      };
    } catch (error) {
      const err = error as Error;
      throw new TranslationError(`Google Translate error: ${err.message}`);
    }
  }

  async translateBatch(
    texts: string[],
    sourceLang: string,
    targetLang: string
  ): Promise<TranslationResult[]> {
    await this.init();

    if (!this.client) {
      throw new TranslationError('Google Translate not configured');
    }

    try {
      const result = await retry(async () => {
        const [translations] = await this.client!.translate(texts, {
          from: sourceLang === 'und' ? undefined : this.mapLangCode(sourceLang),
          to: this.mapLangCode(targetLang),
        });
        return translations;
      });

      const translationArray = Array.isArray(result) ? result : [result];

      return translationArray.map((text) => ({
        text,
        detectedSourceLang: sourceLang === 'und' ? undefined : sourceLang,
      }));
    } catch (error) {
      const err = error as Error;
      throw new TranslationError(`Google Translate error: ${err.message}`);
    }
  }

  async getSupportedLanguages(): Promise<string[]> {
    if (this.supportedLanguages.length > 0) {
      return this.supportedLanguages;
    }

    await this.init();

    if (!this.client) {
      return [];
    }

    try {
      const [languages] = await this.client.getLanguages();
      this.supportedLanguages = languages.map((lang) => lang.code.toLowerCase());
      return this.supportedLanguages;
    } catch (error) {
      console.error('Failed to get Google Translate languages:', error);
      return [];
    }
  }

  /**
   * Map language codes to Google Translate format
   */
  private mapLangCode(lang: string): string {
    const mapping: Record<string, string> = {
      'zh-cn': 'zh-CN',
      'zh-tw': 'zh-TW',
      'pt-br': 'pt',
      'pt-pt': 'pt',
    };

    const lower = lang.toLowerCase();
    return mapping[lower] || lower.split('-')[0];
  }
}
