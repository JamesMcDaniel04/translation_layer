import dotenv from 'dotenv';

dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    env: process.env.NODE_ENV || 'development',
    isDev: process.env.NODE_ENV !== 'production',
  },

  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/translation_layer',
  },

  translation: {
    deepl: {
      apiKey: process.env.DEEPL_API_KEY || '',
    },
    google: {
      credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
    },
    defaultProvider: process.env.DEFAULT_TRANSLATOR || 'deepl',
    defaultTargetLang: process.env.DEFAULT_TARGET_LANG || 'en',
  },

  languageDetection: {
    minChars: parseInt(process.env.LANG_DETECT_MIN_CHARS || '10', 10),
    confidenceThreshold: parseFloat(process.env.LANG_DETECT_CONFIDENCE_THRESHOLD || '0.7'),
    modelPath: process.env.FASTTEXT_MODEL_PATH || './models/lid.176.bin',
  },

  api: {
    keyHeader: process.env.API_KEY_HEADER || 'x-api-key',
  },
} as const;

export type Config = typeof config;
