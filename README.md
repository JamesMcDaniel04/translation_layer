# Translation Layer

A multilingual text normalization API service for rev-intel/CRM/sales platforms. Detects language, translates non-English text to English, and returns structured payloads for downstream processing.

## Features

- **Language Detection**: Fast, local language identification using fastText
- **Translation**: Support for DeepL and Google Translate providers
- **Batch Processing**: Normalize multiple texts in a single request
- **Glossary Support**: Preserve product names, acronyms, and domain terms
- **Usage Tracking**: Per-tenant cost accounting and usage statistics
- **Rev-Intel Ready**: Pre-configured record types for emails, meetings, calls, and CRM notes

## Quick Start

### Prerequisites

- Node.js 18+
- Docker and Docker Compose
- DeepL API key and/or Google Cloud credentials

### Installation

1. Clone the repository:
```bash
git clone https://github.com/JamesMcDaniel04/translation_layer.git
cd translation_layer
```

2. Install dependencies:
```bash
npm install
```

3. Download the fastText language model:
```bash
npm run download-model
```

4. Configure environment:
```bash
cp .env.example .env
# Edit .env with your API keys
```

5. Start with Docker Compose:
```bash
docker-compose up -d
```

Or run locally for development:
```bash
# Start PostgreSQL
docker-compose up -d db

# Run migrations
npm run migrate

# Start dev server
npm run dev
```

## API Usage

### Authentication

All API requests require an API key in the `x-api-key` header:

```bash
curl -X POST http://localhost:3000/v1/normalize \
  -H "Content-Type: application/json" \
  -H "x-api-key: tl_your_api_key" \
  -d '{"tenant_id": "my-tenant", "record_id": "email-123", "text": "Hola mundo"}'
```

For development, any key starting with `tl_` is accepted.

### Normalize Single Text

**POST /v1/normalize**

```json
{
  "tenant_id": "my-company",
  "record_id": "email-123",
  "type": "email_body",
  "text": "Texto en español sobre una oportunidad de ventas...",
  "target_lang": "en"
}
```

Response:

```json
{
  "tenant_id": "my-company",
  "record_id": "email-123",
  "type": "email_body",
  "source_lang": "es",
  "target_lang": "en",
  "text_original": "Texto en español sobre una oportunidad de ventas...",
  "text_normalized": "Text in English about a sales opportunity...",
  "meta": {
    "detected_confidence": 0.98,
    "translator": "deepl",
    "detector": "fastText",
    "chars": 52,
    "estimated_cost_usd": 0.001,
    "request_id": "req_abc123def456"
  }
}
```

### Batch Normalization

**POST /v1/normalize/batch**

```json
{
  "tenant_id": "my-company",
  "target_lang": "en",
  "items": [
    { "record_id": "1", "type": "email_subject", "text": "Réunion importante" },
    { "record_id": "2", "type": "email_body", "text": "Bonjour, voici les détails..." }
  ]
}
```

Response:

```json
{
  "tenant_id": "my-company",
  "results": [
    {
      "record_id": "1",
      "type": "email_subject",
      "source_lang": "fr",
      "target_lang": "en",
      "text_original": "Réunion importante",
      "text_normalized": "Important meeting",
      "meta": { ... }
    },
    { ... }
  ],
  "meta": {
    "total_items": 2,
    "total_chars": 45,
    "estimated_total_cost_usd": 0.0009,
    "request_id": "req_xyz789"
  }
}
```

### Supported Record Types

- `email_subject`
- `email_body`
- `meeting_title`
- `meeting_description`
- `call_note`
- `crm_note`
- `deal_update`
- `custom`

### Health Endpoints

- `GET /health` - Basic liveness check
- `GET /ready` - Readiness probe with dependency checks
- `GET /metrics` - Service metrics

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `DEEPL_API_KEY` | DeepL API key | - |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to Google credentials JSON | - |
| `DEFAULT_TRANSLATOR` | Default translation provider | `deepl` |
| `DEFAULT_TARGET_LANG` | Default target language | `en` |
| `LANG_DETECT_MIN_CHARS` | Minimum chars for detection | `10` |
| `LANG_DETECT_CONFIDENCE_THRESHOLD` | Detection confidence threshold | `0.7` |

### Per-Tenant Configuration

Tenants can configure:
- Preferred translation provider
- Glossary terms to preserve (e.g., "MEDDIC", "Salesforce")

## Development

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Format code
npm run format

# Build for production
npm run build
```

## Architecture

```
Client Request
     │
     ▼
┌─────────────────────────────────────────────┐
│  Express API                                │
│  - Authentication (API Key)                 │
│  - Request validation (Zod)                 │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  Normalization Pipeline                     │
│  1. Detect language (fastText)              │
│  2. Apply glossary preservation             │
│  3. Translate (DeepL/Google)                │
│  4. Track usage                             │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  Response                                   │
│  - Original + normalized text               │
│  - Language info                            │
│  - Metadata (provider, chars, request_id)   │
└─────────────────────────────────────────────┘
```

## Integration Example

```javascript
// At ingest time in your rev-intel pipeline
async function processEmail(email) {
  const response = await fetch('http://translation-layer:3000/v1/normalize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.TRANSLATION_API_KEY,
    },
    body: JSON.stringify({
      tenant_id: 'your-tenant',
      record_id: email.id,
      type: 'email_body',
      text: email.body,
    }),
  });

  const result = await response.json();

  // Store both original and normalized
  await db.emails.update(email.id, {
    body_original: result.text_original,
    body_en: result.text_normalized,
    detected_lang: result.source_lang,
  });

  // Downstream analytics use body_en
  await analytics.process(result.text_normalized);
}
```

## License

MIT
