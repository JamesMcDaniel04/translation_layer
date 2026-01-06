import { getPool } from '../index';
import { Tenant, TranslatorProvider } from '../../types';

export class TenantRepository {
  async findById(id: string): Promise<Tenant | null> {
    const pool = getPool();
    const result = await pool.query<Tenant>(
      'SELECT id, name, translator_provider, glossary, created_at FROM tenants WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async findByName(name: string): Promise<Tenant | null> {
    const pool = getPool();
    const result = await pool.query<Tenant>(
      'SELECT id, name, translator_provider, glossary, created_at FROM tenants WHERE name = $1',
      [name]
    );
    return result.rows[0] || null;
  }

  async create(data: {
    name: string;
    translator_provider?: TranslatorProvider;
    glossary?: { preserve: string[] };
  }): Promise<Tenant> {
    const pool = getPool();
    const result = await pool.query<Tenant>(
      `INSERT INTO tenants (name, translator_provider, glossary)
       VALUES ($1, $2, $3)
       RETURNING id, name, translator_provider, glossary, created_at`,
      [
        data.name,
        data.translator_provider || 'deepl',
        JSON.stringify(data.glossary || { preserve: [] }),
      ]
    );
    return result.rows[0];
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      translator_provider: TranslatorProvider;
      glossary: { preserve: string[] };
    }>
  ): Promise<Tenant | null> {
    const pool = getPool();
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.translator_provider !== undefined) {
      updates.push(`translator_provider = $${paramIndex++}`);
      values.push(data.translator_provider);
    }
    if (data.glossary !== undefined) {
      updates.push(`glossary = $${paramIndex++}`);
      values.push(JSON.stringify(data.glossary));
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query<Tenant>(
      `UPDATE tenants SET ${updates.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, name, translator_provider, glossary, created_at`,
      values
    );
    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const pool = getPool();
    const result = await pool.query('DELETE FROM tenants WHERE id = $1', [id]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  async list(limit = 100, offset = 0): Promise<Tenant[]> {
    const pool = getPool();
    const result = await pool.query<Tenant>(
      `SELECT id, name, translator_provider, glossary, created_at
       FROM tenants
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  }
}

// Singleton instance
export const tenantRepository = new TenantRepository();
