import { Router, Request, Response, NextFunction } from 'express';
import {
  NormalizeRequestSchema,
  BatchNormalizeRequestSchema,
  ValidationError,
} from '../types';
import { normalizeText, normalizeTextBatch } from '../services/translationService';
import { simpleAuthMiddleware } from '../middleware/auth';

const router = Router();

// Apply authentication to all normalize routes
router.use(simpleAuthMiddleware);

/**
 * POST /v1/normalize
 * Normalize a single text item
 */
router.post(
  '/normalize',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body
      const parseResult = NormalizeRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError(
          `Invalid request: ${parseResult.error.errors.map((e) => e.message).join(', ')}`
        );
      }

      const request = parseResult.data;

      // Ensure tenant context exists
      if (!req.tenant) {
        throw new ValidationError('Tenant context not found');
      }

      // Process normalization
      const result = await normalizeText(request, {
        id: req.tenant.id,
        translator_provider: req.tenant.translator_provider,
        glossary: req.tenant.glossary,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /v1/normalize/batch
 * Normalize multiple text items
 */
router.post(
  '/normalize/batch',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body
      const parseResult = BatchNormalizeRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError(
          `Invalid request: ${parseResult.error.errors.map((e) => e.message).join(', ')}`
        );
      }

      const request = parseResult.data;

      // Ensure tenant context exists
      if (!req.tenant) {
        throw new ValidationError('Tenant context not found');
      }

      // Process batch normalization
      const result = await normalizeTextBatch(request, {
        id: req.tenant.id,
        translator_provider: req.tenant.translator_provider,
        glossary: req.tenant.glossary,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /v1/normalize/languages
 * Get list of supported languages
 */
router.get(
  '/normalize/languages',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      // Return common supported languages
      // In production, this would query the active translator
      const languages = [
        { code: 'en', name: 'English' },
        { code: 'es', name: 'Spanish' },
        { code: 'fr', name: 'French' },
        { code: 'de', name: 'German' },
        { code: 'it', name: 'Italian' },
        { code: 'pt', name: 'Portuguese' },
        { code: 'nl', name: 'Dutch' },
        { code: 'pl', name: 'Polish' },
        { code: 'ru', name: 'Russian' },
        { code: 'ja', name: 'Japanese' },
        { code: 'zh', name: 'Chinese' },
        { code: 'ko', name: 'Korean' },
        { code: 'ar', name: 'Arabic' },
        { code: 'hi', name: 'Hindi' },
        { code: 'tr', name: 'Turkish' },
        { code: 'vi', name: 'Vietnamese' },
        { code: 'th', name: 'Thai' },
        { code: 'id', name: 'Indonesian' },
        { code: 'sv', name: 'Swedish' },
        { code: 'da', name: 'Danish' },
        { code: 'no', name: 'Norwegian' },
        { code: 'fi', name: 'Finnish' },
        { code: 'cs', name: 'Czech' },
        { code: 'hu', name: 'Hungarian' },
        { code: 'el', name: 'Greek' },
        { code: 'he', name: 'Hebrew' },
        { code: 'uk', name: 'Ukrainian' },
        { code: 'ro', name: 'Romanian' },
        { code: 'bg', name: 'Bulgarian' },
      ];

      res.status(200).json({
        languages,
        default_target: 'en',
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
