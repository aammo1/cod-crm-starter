import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import {
  createAgentSchema,
  resetAgentPasswordSchema,
  updateAgentSchema,
} from "@/lib/team-schemas";

export type TeamAgent = {
  id: string;
  name: string;
  email: string;
  role: "agent";
  isActive: boolean;
  createdAt: string;
};

export type AccountSessionState = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "agent";
  isActive: boolean;
  sessionVersion: number;
};

export class TeamServiceError extends Error {
  status: 400 | 404 | 409;
  constructor(status: 400 | 404 | 409, message: string) {
    super(message);
    this.name = "TeamServiceError";
    this.status = status;
  }
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: number;
  session_version: number;
  created_at: string;
}

export function listTeamAgents(): TeamAgent[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, name, email, role, is_active, created_at
       FROM users
       WHERE role = 'agent'
       ORDER BY name COLLATE NOCASE ASC, id ASC`,
    )
    .all() as UserRow[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: "agent" as const,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
  }));
}

function insertAgent(input: {
  name: string;
  email: string;
  password: string;
}): TeamAgent {
  const parsed = createAgentSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Données invalides.";
    throw new TeamServiceError(400, msg);
  }

  const { name, email, password } = parsed.data;
  const db = getDb();

  const id = `user_${nanoid(12)}`;
  const passwordHash = hashPassword(password);
  const now = new Date().toISOString();

  try {
    db.prepare(
      `INSERT INTO users (id, email, password_hash, name, role, is_active, session_version, created_at)
       VALUES (?, ?, ?, ?, 'agent', 1, 0, ?)`,
    ).run(id, email, passwordHash, name, now);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed: users.email")
    ) {
      throw new TeamServiceError(
        409,
        "Un compte avec cette adresse email existe déjà.",
      );
    }
    throw error;
  }

  return {
    id,
    name,
    email,
    role: "agent",
    isActive: true,
    createdAt: now,
  };
}

function editAgent(
  id: string,
  input: { name: string } | { isActive: boolean },
): TeamAgent {
  const parsed = updateAgentSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Données invalides.";
    throw new TeamServiceError(400, msg);
  }

  const db = getDb();
  const existing = db
    .prepare(
      `SELECT id, name, email, role, is_active, session_version, created_at
       FROM users
       WHERE id = ?`,
    )
    .get(id) as UserRow | undefined;

  if (!existing || existing.role !== "agent") {
    throw new TeamServiceError(404, "Agent introuvable.");
  }

  if ("name" in parsed.data) {
    db.prepare(
      `UPDATE users
       SET name = ?
       WHERE id = ? AND role = 'agent'`,
    ).run(parsed.data.name, id);

    return {
      id: existing.id,
      name: parsed.data.name,
      email: existing.email,
      role: "agent",
      isActive: Boolean(existing.is_active),
      createdAt: existing.created_at,
    };
  }

  const newActive = parsed.data.isActive;
  const currentActive = Boolean(existing.is_active);

  if (currentActive === newActive) {
    return {
      id: existing.id,
      name: existing.name,
      email: existing.email,
      role: "agent",
      isActive: currentActive,
      createdAt: existing.created_at,
    };
  }

  db.prepare(
    `UPDATE users
     SET is_active = ?, session_version = session_version + 1
     WHERE id = ? AND role = 'agent'`,
  ).run(newActive ? 1 : 0, id);

  return {
    id: existing.id,
    name: existing.name,
    email: existing.email,
    role: "agent",
    isActive: newActive,
    createdAt: existing.created_at,
  };
}

function changeAgentPassword(id: string, password: string): void {
  const parsed = resetAgentPasswordSchema.safeParse({ password });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Mot de passe invalide.";
    throw new TeamServiceError(400, msg);
  }

  const db = getDb();
  const existing = db
    .prepare("SELECT id, role FROM users WHERE id = ?")
    .get(id) as { id: string; role: string } | undefined;

  if (!existing || existing.role !== "agent") {
    throw new TeamServiceError(404, "Agent introuvable.");
  }

  const passwordHash = hashPassword(parsed.data.password);
  db.prepare(
    `UPDATE users
     SET password_hash = ?, session_version = session_version + 1
     WHERE id = ? AND role = 'agent'`,
  ).run(passwordHash, id);
}

function auditAccountChange(event: string, actorId: string, targetId: string) {
  if (!actorId) throw new Error("Account mutation requires an actor");
  getDb().prepare("INSERT INTO security_audit(event, actor_id, target_id, created_at) VALUES (?, ?, ?, ?)")
    .run(event, actorId, targetId, new Date().toISOString());
}

export function createAgent(input: { name: string; email: string; password: string }, actorId: string): TeamAgent {
  return getDb().transaction(() => {
    const agent = insertAgent(input);
    auditAccountChange("agent.created", actorId, agent.id);
    return agent;
  }).immediate();
}

export function updateAgent(id: string, input: { name: string } | { isActive: boolean }, actorId: string): TeamAgent {
  return getDb().transaction(() => {
    const agent = editAgent(id, input);
    const event = "name" in input ? "agent.renamed" : input.isActive ? "agent.enabled" : "agent.disabled";
    auditAccountChange(event, actorId, id);
    return agent;
  }).immediate();
}

export function resetAgentPassword(id: string, password: string, actorId: string): void {
  getDb().transaction(() => {
    changeAgentPassword(id, password);
    auditAccountChange("agent.password_reset", actorId, id);
  }).immediate();
}

export function getAccountSessionState(id: string): AccountSessionState | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, name, email, role, is_active, session_version
       FROM users
       WHERE id = ?`,
    )
    .get(id) as
    | {
        id: string;
        name: string;
        email: string;
        role: string;
        is_active: number;
        session_version: number;
      }
    | undefined;

  if (!row) return null;
  if (row.role !== "admin" && row.role !== "agent") return null;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as "admin" | "agent",
    isActive: Boolean(row.is_active),
    sessionVersion: Number(row.session_version),
  };
}
