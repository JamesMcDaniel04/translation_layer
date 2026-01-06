import { z } from 'zod';

// Supported record types for rev-intel use cases
export const RecordType = z.enum([
  'email_subject',
  'email_body',
  'meeting_title',
  'meeting_description',
  'call_note',
  'crm_note',
  'deal_update',
  'custom',
]);
export type RecordType = z.infer<typeof RecordType>;

// Language codes (ISO 639-1)
export const LanguageCode = z.string().min(2).max(5);
export type LanguageCode = z.infer<typeof LanguageCode>;

// Single normalization request
export const NormalizeRequestSchema = z.object({
  tenant_id: z.string().min(1),
  record_id: z.string().min(1),
  type: RecordType.default('custom'),
  text: z.string().min(1),
  source_lang: LanguageCode.optional(),
  target_lang: LanguageCode.default('en'),
});
export type NormalizeRequest = z.infer<typeof NormalizeRequestSchema>;

// Batch normalization request
export const BatchNormalizeRequestSchema = z.object({
  tenant_id: z.string().min(1),
  target_lang: LanguageCode.default('en'),
  items: z.array(
    z.object({
      record_id: z.string().min(1),
      type: RecordType.default('custom'),
      text: z.string().min(1),
      source_lang: LanguageCode.optional(),
    })
  ).min(1).max(100),
});
export type BatchNormalizeRequest = z.infer<typeof BatchNormalizeRequestSchema>;

// Response metadata
export interface NormalizeMeta {
  detected_confidence?: number;
  translator: string;
  detector: string;
  chars: number;
  request_id: string;
}

// Single normalization response
export interface NormalizeResponse {
  tenant_id: string;
  record_id: string;
  type: string;
  source_lang: string;
  target_lang: string;
  text_original: string;
  text_normalized: string;
  meta: NormalizeMeta;
}

// Batch normalization response
export interface BatchNormalizeResponse {
  tenant_id: string;
  results: NormalizeResponse[];
  meta: {
    total_items: number;
    total_chars: number;
    request_id: string;
  };
}

// Language detection result
export interface LanguageDetectionResult {
  lang: string;
  confidence: number;
  isReliable: boolean;
}

// Translation result
export interface TranslationResult {
  text: string;
  detectedSourceLang?: string;
}

// Provider types
export type TranslatorProvider = 'deepl' | 'google';

// Tenant configuration
export interface Tenant {
  id: string;
  name: string;
  translator_provider: TranslatorProvider;
  glossary: {
    preserve: string[];
  };
  created_at: Date;
}

// API Key
export interface ApiKey {
  id: string;
  tenant_id: string;
  key_hash: string;
  name: string;
  active: boolean;
  created_at: Date;
}

// Usage log entry
export interface UsageLog {
  id: string;
  tenant_id: string;
  request_id: string;
  record_id: string;
  type: string;
  source_lang: string;
  target_lang: string;
  chars_count: number;
  provider: string;
  created_at: Date;
}

// Error types
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Invalid or missing API key') {
    super(401, message, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, message, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class TranslationError extends AppError {
  constructor(message: string) {
    super(502, message, 'TRANSLATION_ERROR');
    this.name = 'TranslationError';
  }
}
