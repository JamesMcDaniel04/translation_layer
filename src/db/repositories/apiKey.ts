import { getPool } from '../index';
import { ApiKey } from '../../types';
import { hashApiKey, generateApiKey } from '../../utils/helpers';

export class ApiKeyRepository {
  async findByHash(keyHash: string): Promise<ApiKey | null> {
    const pool = getPool();
    const result = await pool.query<ApiKey>(
      `SELECT id, tenant_id, key_hash, name, active, created_at, last_used_at
       FROM api_keys WHERE key_hash = $1`,
      [keyHash]
    );
    return result.rows[0] || null;
  }

  async findById(id: string): Promise<ApiKey | null> {
    const pool = getPool();
    const result = await pool.query<ApiKey>(
      `SELECT id, tenant_id, key_hash, name, active, created_at, last_used_at
       FROM api_keys WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async findByTenantId(tenantId: string): Promise<ApiKey[]> {
    const pool = getPool();
    const result = await pool.query<ApiKey>(
      `SELECT id, tenant_id, key_hash, name, active, created_at, last_used_at
       FROM api_keys WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );
    return result.rows;
  }

  async create(data: {
    tenant_id: string;
    name?: string;
  }): Promise<{ apiKey: ApiKey; rawKey: string }> {
    const pool = getPool();
    const rawKey = generateApiKey();
    const keyHash = hashApiKey(rawKey);

    const result = await pool.query<ApiKey>(
      `INSERT INTO api_keys (tenant_id, key_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, tenant_id, key_hash, name, active, created_at`,
      [data.tenant_id, keyHash, data.name || null]
    );

    return {
      apiKey: result.rows[0],
      rawKey, // Return raw key only once at creation
    };
  }

  async updateLastUsed(id: string): Promise<void> {
    const pool = getPool();
    await pool.query(
      'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
      [id]
    );
  }

  async deactivate(id: string): Promise<boolean> {
    const pool = getPool();
    const result = await pool.query(
      'UPDATE api_keys SET active = false WHERE id = $1',
      [id]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async activate(id: string): Promise<boolean> {
    const pool = getPool();
    const result = await pool.query(
      'UPDATE api_keys SET active = true WHERE id = $1',
      [id]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async delete(id: string): Promise<boolean> {
    const pool = getPool();
    const result = await pool.query('DELETE FROM api_keys WHERE id = $1', [id]);
    return result.rowCount !== null && result.rowCount > 0;
  }
}

// Singleton instance
export const apiKeyRepository = new ApiKeyRepository();
