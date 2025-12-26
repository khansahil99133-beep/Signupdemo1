// File: backend/server.js
// Why: Express API with Postgres persistence, structured logging, and metrics.
import path from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import express from 'express';
import cors from 'cors';
import pino from 'pino';
import pinoHttp from 'pino-http';
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from 'prom-client';
import bcrypt from 'bcryptjs';
import {
  ensureSchema,
  initDb,
  insertUser,
  listUsers,
  deleteUserById,
} from './db.js';

const DEFAULT_PORT = 5050;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function assertConfig() {
  const ADMIN_USER = process.env.ADMIN_USER;
  const ADMIN_PASS = process.env.ADMIN_PASS;
  const SESSION_COOKIE = process.env.SESSION_COOKIE;
  if (!ADMIN_USER || !ADMIN_PASS || !SESSION_COOKIE) {
    throw new Error('ADMIN_USER, ADMIN_PASS, and SESSION_COOKIE must be set');
  }
  return {
    ADMIN_USER,
    ADMIN_PASS,
    SESSION_COOKIE,
    SESSION_TTL_SEC: Number(process.env.SESSION_TTL_SEC) || 3600,
  };
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function createMetrics(register) {
  const requestCounter = new Counter({
    name: 'softupkaran_backend_requests_total',
    help: 'Total HTTP requests handled by the backend',
    labelNames: ['method', 'route', 'statusCode'],
    registers: [register],
  });
  const requestDuration = new Histogram({
    name: 'softupkaran_backend_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'statusCode'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [register],
  });
  return { requestCounter, requestDuration };
}

function cryptoRandom() {
  return randomBytes(16).toString('hex');
}

export async function initApp({ pool } = {}) {
  const config = assertConfig();
  const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    base: { service: 'softupkaran-backend' },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
  const httpLogger = pinoHttp({ logger });

  const register = new Registry();
  collectDefaultMetrics({
    register,
    prefix: 'softupkaran_backend_',
  });
  const { requestCounter, requestDuration } = createMetrics(register);

  await initDb({ pool });
  await ensureSchema();

  const app = express();

  app.use(httpLogger);
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  }));
  app.options('*', cors());
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use((req, res, next) => {
    const end = requestDuration.startTimer();
    res.on('finish', () => {
      const route = req.route?.path || req.path;
      const labels = {
        method: req.method,
        route,
        statusCode: String(res.statusCode),
      };
      requestCounter.labels(labels.method, labels.route, labels.statusCode).inc();
      end(labels);
    });
    next();
  });

  const sessions = new Map();
  const sessionTtlMs = config.SESSION_TTL_SEC * 1000;
  const cookieFlags = ['Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (process.env.NODE_ENV === 'production') cookieFlags.push('Secure');

  function parseCookies(req) {
    const header = req.headers.cookie || '';
    return header.split(';').reduce((acc, part) => {
      const [k, ...rest] = part.trim().split('=');
      if (!k) return acc;
      acc[k] = decodeURIComponent(rest.join('='));
      return acc;
    }, {});
  }

  function isAuthed(req) {
    const cookies = parseCookies(req);
    const token = cookies[config.SESSION_COOKIE];
    if (!token) return false;
    const expiresAt = sessions.get(token);
    if (!expiresAt) return false;
    if (expiresAt < Date.now()) {
      sessions.delete(token);
      return false;
    }
    return true;
  }

  function requireAdmin(req, res, next) {
    if (isAuthed(req)) return next();
    logger.warn({ path: req.path, ip: req.ip }, 'unauthorized admin access');
    if (req.accepts('html')) {
      return res.redirect('/admin/login');
    }
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  app.get('/metrics', async (_req, res) => {
    res.setHeader('Content-Type', register.contentType);
    res.send(await register.metrics());
  });

  app.get('/admin/login', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  });

  app.post('/admin/login', asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    if (username === config.ADMIN_USER && password === config.ADMIN_PASS) {
      const token = cryptoRandom();
      sessions.set(token, Date.now() + sessionTtlMs);
      res.setHeader(
        'Set-Cookie',
        `${config.SESSION_COOKIE}=${token}; ${cookieFlags.join('; ')}`,
      );
      logger.info({ username, ip: req.ip }, 'admin login success');
      return res.redirect('/admin');
    }
    logger.warn({ username, ip: req.ip }, 'admin login failure');
    return res.redirect('/admin/login?error=1');
  }));

  app.post('/admin/logout', asyncHandler(async (req, res) => {
    const cookies = parseCookies(req);
    const token = cookies[config.SESSION_COOKIE];
    if (token) sessions.delete(token);
    res.setHeader('Set-Cookie', `${config.SESSION_COOKIE}=; ${cookieFlags.join('; ')}; Max-Age=0`);
    res.redirect('/admin/login');
  }));

  app.use('/admin', requireAdmin, express.static(path.join(__dirname, 'public')));

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'softupkaran-backend' }));

  app.get('/api/users', requireAdmin, asyncHandler(async (_req, res) => {
    const users = await listUsers();
    res.json({ count: users.length, users });
  }));

  app.get('/api/export', requireAdmin, asyncHandler(async (req, res) => {
    const format = (req.query.format || 'csv').toString().toLowerCase();
    if (format !== 'csv') {
      return res.status(400).json({ ok: false, error: 'only csv export is supported' });
    }
    const users = await listUsers();
    const columns = ['name', 'email', 'whatsapp', 'telegram', 'createdAt', 'id'];
    const rows = [columns.join(',')];
    for (const user of users) {
      const line = columns.map((key) => csvEscape(user[key] ?? '')).join(',');
      rows.push(line);
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
    res.send(rows.join('\n'));
  }));

  app.delete('/api/users/:id', requireAdmin, asyncHandler(async (req, res) => {
    const id = (req.params.id || '').toString();
    if (!id) return res.status(400).json({ ok: false, error: 'id is required' });
    const deleted = await deleteUserById(id);
    if (!deleted) {
      return res.status(404).json({ ok: false, error: 'user not found' });
    }
    res.json({ ok: true, deleted: id });
  }));

  app.post('/api/signup', asyncHandler(async (req, res) => {
    const payload = req.body || {};
    if (!payload.password) {
      return res.status(400).json({ ok: false, error: 'password is required' });
    }
    const rawTelegram = (payload.telegram || '').toString().trim();
    if (!rawTelegram) {
      return res.status(400).json({ ok: false, error: 'telegram username is required' });
    }
    const tgHandle = rawTelegram.startsWith('@') ? rawTelegram.slice(1) : rawTelegram;
    if (!/^[a-zA-Z0-9_]{5,32}$/.test(tgHandle)) {
      return res.status(400).json({ ok: false, error: 'telegram username is invalid' });
    }
    const hashedPassword = await bcrypt.hash(payload.password, 10);
    const userRecord = {
      id: cryptoRandom(),
      name: payload.name,
      email: payload.email,
      whatsapp: payload.whatsapp,
      telegram: `@${tgHandle}`,
      passwordHash: hashedPassword,
    };
    const user = await insertUser(userRecord);
    logger.info(
      { id: user.id, email: payload.email, ip: req.ip },
      'signup succeeded',
    );
    res.status(201).json({ ok: true, user });
  }));

  app.use((err, _req, res, _next) => {
    logger.error({ err }, 'unhandled error');
    res.status(err.status || 500).json({ ok: false, error: 'internal server error' });
  });

  return { app, logger, register };
}

function csvEscape(value) {
  const str = value.toString().replace(/\r?\n/g, ' ').replace(/"/g, '""');
  return /[",]/.test(str) ? `"${str}"` : str;
}

const port = Number(process.env.PORT) || DEFAULT_PORT;

if (process.env.NODE_ENV !== 'test') {
  const run = async () => {
    try {
      const { app, logger } = await initApp();
      app.listen(port, () => {
        logger.info({ port }, 'Softupkaran backend ready');
        logger.info({ admin: `/admin` }, 'admin UI ready');
      });
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  };
  run();
}
