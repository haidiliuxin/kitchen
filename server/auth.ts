import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

export type AuthUser = {
  id: string
  identifier: string
  displayName: string
}

type UserRow = {
  id: string
  identifier: string
  display_name: string
  password_hash: string
}

type SessionRow = {
  user_id: string
  identifier: string
  display_name: string
}

function hashPassword(password: string): string {
  return createHash('sha256').update(password, 'utf8').digest('hex')
}

function createToken(): string {
  return randomBytes(32).toString('base64url')
}

function toAuthUser(row: { user_id?: string; id?: string; identifier: string; display_name: string }): AuthUser {
  return {
    id: row.id ?? row.user_id ?? '',
    identifier: row.identifier,
    displayName: row.display_name,
  }
}

export function registerOrLoginUser(
  db: DatabaseSync,
  identifier: string,
  password: string,
): { user: AuthUser; token: string; isNewUser: boolean } {
  const normalizedIdentifier = identifier.trim().toLowerCase()
  const displayName = identifier.trim().includes('@')
    ? identifier.trim().split('@')[0]
    : identifier.trim()
  const passwordHash = hashPassword(password)
  const existing = db
    .prepare('SELECT id, identifier, display_name, password_hash FROM users WHERE identifier = ?')
    .get(normalizedIdentifier) as UserRow | undefined

  let user: AuthUser
  let isNewUser = false

  if (existing) {
    if (existing.password_hash !== passwordHash) {
      throw new Error('密码不正确。')
    }

    user = toAuthUser(existing)
  } else {
    const userId = randomUUID()
    db.prepare(`
      INSERT INTO users (id, identifier, display_name, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, normalizedIdentifier, displayName, passwordHash, new Date().toISOString())
    user = {
      id: userId,
      identifier: normalizedIdentifier,
      displayName,
    }
    isNewUser = true
  }

  const token = createToken()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 60)

  db.prepare(`
    INSERT INTO auth_sessions (token, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(token, user.id, now.toISOString(), expiresAt.toISOString())

  return { user, token, isNewUser }
}

export function getUserByToken(db: DatabaseSync, token: string): AuthUser | null {
  const row = db
    .prepare(`
      SELECT
        s.user_id,
        u.identifier,
        u.display_name
      FROM auth_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ?
        AND s.expires_at > ?
    `)
    .get(token, new Date().toISOString()) as SessionRow | undefined

  return row ? toAuthUser(row) : null
}

export function revokeAuthToken(db: DatabaseSync, token: string): void {
  db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token)
}
