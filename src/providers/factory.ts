import { Translator } from './translator.interface';
import { DeepLTranslator } from './deepl';
import { GoogleTranslator } from './google';
import { TranslatorProvider, TranslationError } from '../types';
import { config } from '../config';

// Singleton instances
let deeplTranslator: DeepLTranslator | null = null;
let googleTranslator: GoogleTranslator | null = null;

/**
 * Get a translator instance by provider name
 */
export function getTranslator(provider: TranslatorProvider): Translator {
  switch (provider) {
    case 'deepl':
      if (!deeplTranslator) {
        deeplTranslator = new DeepLTranslator();
      }
      return deeplTranslator;

    case 'google':
      if (!googleTranslator) {
        googleTranslator = new GoogleTranslator();
      }
      return googleTranslator;

    default:
      throw new TranslationError(`Unknown translation provider: ${provider}`);
  }
}

/**
 * Get the default translator based on configuration
 */
export function getDefaultTranslator(): Translator {
  return getTranslator(config.translation.defaultProvider as TranslatorProvider);
}

/**
 * Get translator for a specific tenant
 */
export function getTranslatorForTenant(tenantProvider?: string): Translator {
  const provider = (tenantProvider || config.translation.defaultProvider) as TranslatorProvider;
  return getTranslator(provider);
}

/**
 * Get all available translators
 */
export function getAvailableTranslators(): Record<string, boolean> {
  const deepl = getTranslator('deepl');
  const google = getTranslator('google');

  return {
    deepl: deepl.isAvailable(),
    google: google.isAvailable(),
  };
}

/**
 * Get the first available translator (fallback mechanism)
 */
export function getAnyAvailableTranslator(): Translator | null {
  const defaultTranslator = getDefaultTranslator();
  if (defaultTranslator.isAvailable()) {
    return defaultTranslator;
  }

  // Try other providers as fallback
  const providers: TranslatorProvider[] = ['deepl', 'google'];
  for (const provider of providers) {
    const translator = getTranslator(provider);
    if (translator.isAvailable()) {
      return translator;
    }
  }

  return null;
}
