import { usageLogRepository, CreateUsageLogData } from '../db/repositories/usageLog';

/**
 * Track usage for a single normalization request
 */
export async function trackUsage(data: CreateUsageLogData): Promise<void> {
  try {
    await usageLogRepository.create(data);
  } catch (error) {
    // Log but don't fail the request
    console.error('Failed to track usage:', error);
  }
}

/**
 * Track usage for batch normalization requests
 */
export async function trackBatchUsage(logs: CreateUsageLogData[]): Promise<void> {
  try {
    await usageLogRepository.createBatch(logs);
  } catch (error) {
    // Log but don't fail the request
    console.error('Failed to track batch usage:', error);
  }
}

/**
 * Estimate cost based on character count
 * Returns estimated cost in USD (rough estimates)
 */
export function estimateCost(
  chars: number,
  provider: string
): { chars: number; estimated_usd?: number } {
  // Rough pricing (as of 2024):
  // DeepL: ~$20 per 1M characters
  // Google: ~$20 per 1M characters
  const costPer1M: Record<string, number> = {
    deepl: 20,
    google: 20,
  };

  const rate = costPer1M[provider] || 20;
  const estimated_usd = (chars / 1_000_000) * rate;

  return {
    chars,
    estimated_usd: Math.round(estimated_usd * 10000) / 10000, // 4 decimal places
  };
}

/**
 * Get usage statistics for a tenant
 */
export async function getTenantStats(
  tenantId: string,
  startDate?: Date,
  endDate?: Date
) {
  return usageLogRepository.getStats(tenantId, startDate, endDate);
}
