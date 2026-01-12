-- Production Enhancements Migration
-- Adds: API key expiration, audit logging, rate limit overrides, partitioned usage logs

-- Add rate_limit_override to tenants
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS rate_limit_override JSONB DEFAULT NULL;

-- Add expires_at to api_keys
ALTER TABLE api_keys
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Update last_used_at to have proper type if not exists
-- (already exists from initial migration, but ensure it's there)

-- Create audit_logs table for compliance
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(255),
    actor_type VARCHAR(50) NOT NULL DEFAULT 'api_key',
    actor_id VARCHAR(255),
    details JSONB,
    outcome VARCHAR(20) NOT NULL DEFAULT 'success',
    reason TEXT,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_type, actor_id);

-- Create cost_tracking table for billing
CREATE TABLE IF NOT EXISTS cost_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    provider VARCHAR(50) NOT NULL,
    total_requests INTEGER DEFAULT 0,
    total_chars BIGINT DEFAULT 0,
    estimated_cost_usd DECIMAL(10, 4) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, period_start, period_end, provider)
);

-- Index for cost_tracking
CREATE INDEX IF NOT EXISTS idx_cost_tracking_tenant_period
ON cost_tracking(tenant_id, period_start, period_end);

-- Create provider_metrics table for performance tracking
CREATE TABLE IF NOT EXISTS provider_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    requests_total INTEGER DEFAULT 0,
    requests_success INTEGER DEFAULT 0,
    requests_failed INTEGER DEFAULT 0,
    avg_latency_ms DECIMAL(10, 2),
    p99_latency_ms DECIMAL(10, 2),
    circuit_breaker_state VARCHAR(20) DEFAULT 'closed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for provider_metrics
CREATE INDEX IF NOT EXISTS idx_provider_metrics_provider_timestamp
ON provider_metrics(provider, timestamp DESC);

-- Create rate_limit_state table for distributed rate limiting persistence
CREATE TABLE IF NOT EXISTS rate_limit_state (
    key VARCHAR(255) PRIMARY KEY,
    count INTEGER DEFAULT 0,
    window_start TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Index for cleanup
CREATE INDEX IF NOT EXISTS idx_rate_limit_expires ON rate_limit_state(expires_at);

-- Add additional indexes to usage_logs for better query performance
CREATE INDEX IF NOT EXISTS idx_usage_logs_tenant_created
ON usage_logs(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_logs_provider
ON usage_logs(provider);

CREATE INDEX IF NOT EXISTS idx_usage_logs_source_lang
ON usage_logs(source_lang);

-- Create function to update cost_tracking from usage_logs
CREATE OR REPLACE FUNCTION update_cost_tracking()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO cost_tracking (
        tenant_id,
        period_start,
        period_end,
        provider,
        total_requests,
        total_chars,
        estimated_cost_usd
    )
    VALUES (
        NEW.tenant_id,
        DATE_TRUNC('day', NEW.created_at)::DATE,
        (DATE_TRUNC('day', NEW.created_at) + INTERVAL '1 day')::DATE,
        COALESCE(NEW.provider, 'unknown'),
        1,
        NEW.chars_count,
        (NEW.chars_count::DECIMAL / 1000000) * 20 -- $20 per 1M chars estimate
    )
    ON CONFLICT (tenant_id, period_start, period_end, provider)
    DO UPDATE SET
        total_requests = cost_tracking.total_requests + 1,
        total_chars = cost_tracking.total_chars + EXCLUDED.total_chars,
        estimated_cost_usd = cost_tracking.estimated_cost_usd + EXCLUDED.estimated_cost_usd,
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update cost tracking
DROP TRIGGER IF EXISTS trigger_update_cost_tracking ON usage_logs;
CREATE TRIGGER trigger_update_cost_tracking
    AFTER INSERT ON usage_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_cost_tracking();

-- Create function to clean up expired rate limit entries
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void AS $$
BEGIN
    DELETE FROM rate_limit_state WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Create function to clean up old audit logs (retention: 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Insert some test tenants for development
INSERT INTO tenants (id, name, translator_provider, glossary, rate_limit_override)
VALUES
    ('00000000-0000-0000-0000-000000000002', 'Test Tenant 1', 'deepl', '{"preserve": ["MEDDIC", "Salesforce"]}', '{"requests_per_minute": 200}'),
    ('00000000-0000-0000-0000-000000000003', 'Test Tenant 2', 'google', '{"preserve": ["CRM", "Pipeline"]}', NULL)
ON CONFLICT (id) DO NOTHING;

-- Add index for API key expiration lookups
CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at ON api_keys(expires_at) WHERE expires_at IS NOT NULL;
