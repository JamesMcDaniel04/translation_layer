import {
  NormalizeRequestSchema,
  BatchNormalizeRequestSchema,
} from '../types';

describe('validation schemas', () => {
  describe('NormalizeRequestSchema', () => {
    it('should validate a valid request', () => {
      const validRequest = {
        tenant_id: 'test-tenant',
        record_id: 'email-123',
        type: 'email_body',
        text: 'Hello world',
        target_lang: 'en',
      };

      const result = NormalizeRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should accept request without optional fields', () => {
      const minimalRequest = {
        tenant_id: 'test-tenant',
        record_id: 'email-123',
        text: 'Hello world',
      };

      const result = NormalizeRequestSchema.safeParse(minimalRequest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('custom');
        expect(result.data.target_lang).toBe('en');
      }
    });

    it('should accept source_lang when provided', () => {
      const request = {
        tenant_id: 'test-tenant',
        record_id: 'email-123',
        text: 'Hola mundo',
        source_lang: 'es',
      };

      const result = NormalizeRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.source_lang).toBe('es');
      }
    });

    it('should reject request without tenant_id', () => {
      const invalidRequest = {
        record_id: 'email-123',
        text: 'Hello world',
      };

      const result = NormalizeRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it('should reject request without record_id', () => {
      const invalidRequest = {
        tenant_id: 'test-tenant',
        text: 'Hello world',
      };

      const result = NormalizeRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it('should reject request without text', () => {
      const invalidRequest = {
        tenant_id: 'test-tenant',
        record_id: 'email-123',
      };

      const result = NormalizeRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it('should reject empty text', () => {
      const invalidRequest = {
        tenant_id: 'test-tenant',
        record_id: 'email-123',
        text: '',
      };

      const result = NormalizeRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it('should validate all record types', () => {
      const recordTypes = [
        'email_subject',
        'email_body',
        'meeting_title',
        'meeting_description',
        'call_note',
        'crm_note',
        'deal_update',
        'custom',
      ];

      for (const type of recordTypes) {
        const request = {
          tenant_id: 'test-tenant',
          record_id: 'record-123',
          text: 'Test text',
          type,
        };

        const result = NormalizeRequestSchema.safeParse(request);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('BatchNormalizeRequestSchema', () => {
    it('should validate a valid batch request', () => {
      const validRequest = {
        tenant_id: 'test-tenant',
        target_lang: 'en',
        items: [
          { record_id: '1', type: 'email_body', text: 'Hello' },
          { record_id: '2', type: 'email_subject', text: 'World' },
        ],
      };

      const result = BatchNormalizeRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should accept minimal batch request', () => {
      const minimalRequest = {
        tenant_id: 'test-tenant',
        items: [{ record_id: '1', text: 'Hello' }],
      };

      const result = BatchNormalizeRequestSchema.safeParse(minimalRequest);
      expect(result.success).toBe(true);
    });

    it('should reject empty items array', () => {
      const invalidRequest = {
        tenant_id: 'test-tenant',
        items: [],
      };

      const result = BatchNormalizeRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it('should reject more than 100 items', () => {
      const items = Array.from({ length: 101 }, (_, i) => ({
        record_id: `${i}`,
        text: 'Test',
      }));

      const invalidRequest = {
        tenant_id: 'test-tenant',
        items,
      };

      const result = BatchNormalizeRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it('should accept up to 100 items', () => {
      const items = Array.from({ length: 100 }, (_, i) => ({
        record_id: `${i}`,
        text: 'Test',
      }));

      const validRequest = {
        tenant_id: 'test-tenant',
        items,
      };

      const result = BatchNormalizeRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should allow source_lang per item', () => {
      const request = {
        tenant_id: 'test-tenant',
        items: [
          { record_id: '1', text: 'Hello', source_lang: 'en' },
          { record_id: '2', text: 'Hola', source_lang: 'es' },
        ],
      };

      const result = BatchNormalizeRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });
  });
});
