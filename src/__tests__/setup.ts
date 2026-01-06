// Jest test setup file

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/translation_layer_test';
process.env.DEEPL_API_KEY = 'test_deepl_key';
process.env.LANG_DETECT_MIN_CHARS = '10';
process.env.LANG_DETECT_CONFIDENCE_THRESHOLD = '0.7';
process.env.DEFAULT_TRANSLATOR = 'deepl';
process.env.DEFAULT_TARGET_LANG = 'en';

// Global test timeout
jest.setTimeout(10000);

// Clean up after all tests
afterAll(async () => {
  // Add cleanup logic if needed
});
