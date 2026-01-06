import {
  generateRequestId,
  hashApiKey,
  generateApiKey,
  countChars,
  normalizeWhitespace,
  isMostlySymbolsOrNumbers,
  applyGlossary,
  removeGlossaryMarkers,
} from '../utils/helpers';

describe('helpers', () => {
  describe('generateRequestId', () => {
    it('should generate a request ID with correct prefix', () => {
      const id = generateRequestId();
      expect(id).toMatch(/^req_[a-f0-9]{16}$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateRequestId()));
      expect(ids.size).toBe(100);
    });
  });

  describe('hashApiKey', () => {
    it('should hash API keys consistently', () => {
      const key = 'tl_test_key_12345';
      const hash1 = hashApiKey(key);
      const hash2 = hashApiKey(key);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different keys', () => {
      const hash1 = hashApiKey('key1');
      const hash2 = hashApiKey('key2');
      expect(hash1).not.toBe(hash2);
    });

    it('should produce 64-character hex string', () => {
      const hash = hashApiKey('test');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('generateApiKey', () => {
    it('should generate API key with correct prefix', () => {
      const key = generateApiKey();
      expect(key).toMatch(/^tl_[a-f0-9]{64}$/);
    });

    it('should generate unique keys', () => {
      const keys = new Set(Array.from({ length: 100 }, () => generateApiKey()));
      expect(keys.size).toBe(100);
    });
  });

  describe('countChars', () => {
    it('should count characters in text', () => {
      expect(countChars('hello')).toBe(5);
      expect(countChars('hello world')).toBe(11);
      expect(countChars('')).toBe(0);
    });

    it('should include whitespace in count', () => {
      expect(countChars('  ')).toBe(2);
      expect(countChars('a b c')).toBe(5);
    });
  });

  describe('normalizeWhitespace', () => {
    it('should collapse multiple spaces', () => {
      expect(normalizeWhitespace('hello   world')).toBe('hello world');
    });

    it('should trim leading and trailing whitespace', () => {
      expect(normalizeWhitespace('  hello  ')).toBe('hello');
    });

    it('should handle newlines and tabs', () => {
      expect(normalizeWhitespace('hello\n\nworld')).toBe('hello world');
      expect(normalizeWhitespace('hello\t\tworld')).toBe('hello world');
    });
  });

  describe('isMostlySymbolsOrNumbers', () => {
    it('should return false for normal text', () => {
      expect(isMostlySymbolsOrNumbers('Hello World')).toBe(false);
      expect(isMostlySymbolsOrNumbers('This is a sentence')).toBe(false);
    });

    it('should return true for mostly numbers', () => {
      expect(isMostlySymbolsOrNumbers('123456789')).toBe(true);
      expect(isMostlySymbolsOrNumbers('12345 67890')).toBe(true);
    });

    it('should return true for mostly symbols', () => {
      expect(isMostlySymbolsOrNumbers('!@#$%^&*()')).toBe(true);
      expect(isMostlySymbolsOrNumbers('---===---')).toBe(true);
    });

    it('should handle mixed content', () => {
      expect(isMostlySymbolsOrNumbers('abc123def456')).toBe(false);
      expect(isMostlySymbolsOrNumbers('12ab')).toBe(false);
    });
  });

  describe('applyGlossary and removeGlossaryMarkers', () => {
    it('should wrap preserved terms', () => {
      const text = 'We use Salesforce for CRM';
      const result = applyGlossary(text, ['Salesforce']);
      expect(result).toBe('We use <keep>Salesforce</keep> for CRM');
    });

    it('should handle multiple terms', () => {
      const text = 'MEDDIC is used with Salesforce';
      const result = applyGlossary(text, ['MEDDIC', 'Salesforce']);
      expect(result).toBe('<keep>MEDDIC</keep> is used with <keep>Salesforce</keep>');
    });

    it('should be case insensitive', () => {
      const text = 'salesforce and SALESFORCE';
      const result = applyGlossary(text, ['Salesforce']);
      expect(result).toBe('<keep>salesforce</keep> and <keep>SALESFORCE</keep>');
    });

    it('should remove glossary markers', () => {
      const text = '<keep>Salesforce</keep> is great';
      const result = removeGlossaryMarkers(text);
      expect(result).toBe('Salesforce is great');
    });

    it('should handle nested markers', () => {
      const text = 'Use <keep>MEDDIC</keep> with <keep>Salesforce</keep>';
      const result = removeGlossaryMarkers(text);
      expect(result).toBe('Use MEDDIC with Salesforce');
    });
  });
});
