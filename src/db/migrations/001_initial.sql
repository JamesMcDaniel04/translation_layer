-- Translation Layer Initial Schema
-- Run with: psql -d translation_layer -f 001_initial.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tenants table
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    translator_provider VARCHAR(50) DEFAULT 'deepl',
    glossary JSONB DEFAULT '{"preserve": []}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key_hash VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(255),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE
);

-- Usage Logs table
CREATE TABLE IF NOT EXISTS usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    request_id VARCHAR(100) NOT NULL,
    record_id VARCHAR(255),
    type VARCHAR(100),
    source_lang VARCHAR(10),
    target_lang VARCHAR(10),
    chars_count INTEGER DEFAULT 0,
    provider VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant_id ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_tenant_id ON usage_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_request_id ON usage_logs(request_id);

-- Insert a default development tenant
INSERT INTO tenants (id, name, translator_provider, glossary)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Development Tenant',
    'deepl',
    '{"preserve": ["MEDDIC", "Salesforce", "CRM"]}'
) ON CONFLICT (id) DO NOTHING;

-- Insert a default development API key (hash of 'tl_dev_key_12345')
-- In production, generate proper keys using the utility functions
INSERT INTO api_keys (tenant_id, key_hash, name, active)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    '7c222fb2927d828af22f592134e8932480637c0d2d4f0a6b4d5f4e8f7a8b9c0d',
    'Development Key',
    true
) ON CONFLICT DO NOTHING;
