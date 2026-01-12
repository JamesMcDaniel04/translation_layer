import { getPool } from '../index';
import { AuditLog } from '../../types';
import { config } from '../../config';

export interface CreateAuditLogData {
  tenant_id?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  actor_type?: 'user' | 'system' | 'api_key';
  actor_id?: string;
  details?: Record<string, unknown>;
  outcome: 'success' | 'failure';
  reason?: string;
  ip_address?: string;
}

export class AuditLogRepository {
  async create(data: CreateAuditLogData): Promise<AuditLog | null> {
    if (!config.audit.enabled) return null;

    const pool = getPool();
    const result = await pool.query<AuditLog>(
      `INSERT INTO audit_logs (
        tenant_id, action, resource_type, resource_id,
        actor_type, actor_id, details, outcome, reason, ip_address
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        data.tenant_id || null,
        data.action,
        data.resource_type,
        data.resource_id || null,
        data.actor_type || 'api_key',
        data.actor_id || null,
        data.details ? JSON.stringify(data.details) : null,
        data.outcome,
        data.reason || null,
        data.ip_address || null,
      ]
    );
    return result.rows[0] || null;
  }

  async findByTenantId(
    tenantId: string,
    limit = 100,
    offset = 0
  ): Promise<AuditLog[]> {
    const pool = getPool();
    const result = await pool.query<AuditLog>(
      `SELECT * FROM audit_logs
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset]
    );
    return result.rows;
  }

  async findByAction(
    action: string,
    limit = 100,
    offset = 0
  ): Promise<AuditLog[]> {
    const pool = getPool();
    const result = await pool.query<AuditLog>(
      `SELECT * FROM audit_logs
       WHERE action = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [action, limit, offset]
    );
    return result.rows;
  }

  async findByResourceType(
    resourceType: string,
    resourceId?: string,
    limit = 100
  ): Promise<AuditLog[]> {
    const pool = getPool();

    if (resourceId) {
      const result = await pool.query<AuditLog>(
        `SELECT * FROM audit_logs
         WHERE resource_type = $1 AND resource_id = $2
         ORDER BY created_at DESC
         LIMIT $3`,
        [resourceType, resourceId, limit]
      );
      return result.rows;
    }

    const result = await pool.query<AuditLog>(
      `SELECT * FROM audit_logs
       WHERE resource_type = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [resourceType, limit]
    );
    return result.rows;
  }

  async findByDateRange(
    startDate: Date,
    endDate: Date,
    tenantId?: string
  ): Promise<AuditLog[]> {
    const pool = getPool();

    if (tenantId) {
      const result = await pool.query<AuditLog>(
        `SELECT * FROM audit_logs
         WHERE created_at >= $1 AND created_at <= $2 AND tenant_id = $3
         ORDER BY created_at DESC`,
        [startDate, endDate, tenantId]
      );
      return result.rows;
    }

    const result = await pool.query<AuditLog>(
      `SELECT * FROM audit_logs
       WHERE created_at >= $1 AND created_at <= $2
       ORDER BY created_at DESC`,
      [startDate, endDate]
    );
    return result.rows;
  }

  async cleanup(retentionDays = 90): Promise<number> {
    const pool = getPool();
    const result = await pool.query(
      `DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '${retentionDays} days'`
    );
    return result.rowCount || 0;
  }
}

export const auditLogRepository = new AuditLogRepository();

// Helper function for easy audit logging
export async function logAudit(data: CreateAuditLogData): Promise<void> {
  try {
    await auditLogRepository.create(data);
  } catch (error) {
    // Don't fail the main operation if audit logging fails
    console.error('Failed to create audit log:', error);
  }
}
