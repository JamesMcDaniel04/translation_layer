import { getPool } from '../index';
import { UsageLog } from '../../types';

export interface CreateUsageLogData {
  tenant_id: string;
  request_id: string;
  record_id?: string;
  type?: string;
  source_lang?: string;
  target_lang?: string;
  chars_count?: number;
  provider?: string;
}

export interface UsageStats {
  total_requests: number;
  total_chars: number;
  by_provider: Record<string, { requests: number; chars: number }>;
  by_lang: Record<string, number>;
}

export class UsageLogRepository {
  async create(data: CreateUsageLogData): Promise<UsageLog> {
    const pool = getPool();
    const result = await pool.query<UsageLog>(
      `INSERT INTO usage_logs (tenant_id, request_id, record_id, type, source_lang, target_lang, chars_count, provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        data.tenant_id,
        data.request_id,
        data.record_id || null,
        data.type || null,
        data.source_lang || null,
        data.target_lang || null,
        data.chars_count || 0,
        data.provider || null,
      ]
    );
    return result.rows[0];
  }

  async createBatch(logs: CreateUsageLogData[]): Promise<void> {
    if (logs.length === 0) return;

    const pool = getPool();
    const values: unknown[] = [];
    const placeholders: string[] = [];

    logs.forEach((log, index) => {
      const baseIndex = index * 8;
      placeholders.push(
        `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8})`
      );
      values.push(
        log.tenant_id,
        log.request_id,
        log.record_id || null,
        log.type || null,
        log.source_lang || null,
        log.target_lang || null,
        log.chars_count || 0,
        log.provider || null
      );
    });

    await pool.query(
      `INSERT INTO usage_logs (tenant_id, request_id, record_id, type, source_lang, target_lang, chars_count, provider)
       VALUES ${placeholders.join(', ')}`,
      values
    );
  }

  async findByTenantId(
    tenantId: string,
    limit = 100,
    offset = 0
  ): Promise<UsageLog[]> {
    const pool = getPool();
    const result = await pool.query<UsageLog>(
      `SELECT * FROM usage_logs
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset]
    );
    return result.rows;
  }

  async findByRequestId(requestId: string): Promise<UsageLog[]> {
    const pool = getPool();
    const result = await pool.query<UsageLog>(
      'SELECT * FROM usage_logs WHERE request_id = $1 ORDER BY created_at',
      [requestId]
    );
    return result.rows;
  }

  async getStats(
    tenantId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<UsageStats> {
    const pool = getPool();
    let query = `
      SELECT
        COUNT(*)::int as total_requests,
        COALESCE(SUM(chars_count), 0)::int as total_chars,
        provider,
        source_lang
      FROM usage_logs
      WHERE tenant_id = $1
    `;
    const params: unknown[] = [tenantId];

    if (startDate) {
      params.push(startDate);
      query += ` AND created_at >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      query += ` AND created_at <= $${params.length}`;
    }

    query += ' GROUP BY provider, source_lang';

    const result = await pool.query(query, params);

    const stats: UsageStats = {
      total_requests: 0,
      total_chars: 0,
      by_provider: {},
      by_lang: {},
    };

    for (const row of result.rows) {
      stats.total_requests += row.total_requests;
      stats.total_chars += row.total_chars;

      if (row.provider) {
        if (!stats.by_provider[row.provider]) {
          stats.by_provider[row.provider] = { requests: 0, chars: 0 };
        }
        stats.by_provider[row.provider].requests += row.total_requests;
        stats.by_provider[row.provider].chars += row.total_chars;
      }

      if (row.source_lang) {
        stats.by_lang[row.source_lang] =
          (stats.by_lang[row.source_lang] || 0) + row.total_requests;
      }
    }

    return stats;
  }
}

// Singleton instance
export const usageLogRepository = new UsageLogRepository();
