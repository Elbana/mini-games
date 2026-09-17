import fs from 'fs';
import { OPERATORS_FILE, REQUIRE_AUTH } from '../config.mjs';

let cached = null;

function loadOperatorsFile() {
  if (cached) return cached;
  try {
    cached = JSON.parse(fs.readFileSync(OPERATORS_FILE, 'utf8'));
  } catch {
    cached = { operators: [] };
  }
  return cached;
}

export function extractOperatorToken(req) {
  const auth = req.headers?.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  const q = { ...req.query, ...req.body };
  return q.token || req.headers['x-operator-token'] || null;
}

export function resolveOperator(token) {
  if (!token) return null;
  return loadOperatorsFile().operators.find((op) => op.token === token) ?? null;
}

export function requireOperator(req, res) {
  const token = extractOperatorToken(req);
  if (!token) {
    if (REQUIRE_AUTH) {
      res.status(401).json({ error: 'Operator token required' });
      return null;
    }
    const demo = resolveOperator('op_demo');
    if (demo) return demo;
    res.status(401).json({ error: 'Operator token required' });
    return null;
  }
  const operator = resolveOperator(token);
  if (!operator) {
    res.status(403).json({ error: 'Invalid operator token' });
    return null;
  }
  return operator;
}

export function isGameEnabled(operator, slug) {
  return Array.isArray(operator?.enabledGames) && operator.enabledGames.includes(slug);
}

export function requireGameAccess(req, res, slug) {
  const operator = requireOperator(req, res);
  if (!operator) return null;
  if (!isGameEnabled(operator, slug)) {
    res.status(403).json({ error: 'Game not enabled', slug });
    return null;
  }
  return operator;
}
