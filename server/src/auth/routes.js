import { prisma } from '../db/prisma.js';
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from './jwt.js';
import { hashPassword, comparePassword, genOtp } from './bcrypt.js';
import { env } from '../config/env.js';

async function issueTokens(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  await prisma.refreshToken.create({
    data: {
      user_id: user.id,
      token: refreshToken,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  return { accessToken, refreshToken };
}

export const authRouter = (await import('express')).Router();

// --- Login (email + password) ---
authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email: String(email || '').toLowerCase() } });
    if (!user || !user.password_hash) return res.status(401).json({ error: 'Credenciales inválidas' });
    if (user.blocked) return res.status(403).json({ error: 'Usuario bloqueado' });
    if (!comparePassword(password, user.password_hash)) return res.status(401).json({ error: 'Credenciales inválidas' });
    const tokens = await issueTokens(user);
    res.json({
      ...tokens,
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role, data: user.data },
    });
  } catch (e) { next(e); }
});

// --- Register (email + password). No loguea; requiere OTP. ---
authRouter.post('/register', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const e = String(email || '').toLowerCase();
    if (!e || !password) return res.status(400).json({ error: 'Email y password requeridos' });
    const exists = await prisma.user.findUnique({ where: { email: e } });
    if (exists) return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
    const user = await prisma.user.create({
      data: { email: e, password_hash: hashPassword(password), email_verified: false, role: 'user' },
    });
    const code = await createOtp(e, 'register');
    // air-gap: mostramos el OTP en el log del server (no hay email saliente).
    console.log(`[otp] registro ${e} → código: ${code} (válido ${env.otpTtlMinutes} min)`);
    res.json({ id: user.id, email: user.email, message: 'Registrado. Verificá el código OTP (ver log del servidor en air-gap).' });
  } catch (e) { next(e); }
});

// --- Verify OTP → activa usuario y emite tokens ---
authRouter.post('/verify-otp', async (req, res, next) => {
  try {
    const { email, otpCode } = req.body;
    const e = String(email || '').toLowerCase();
    const rec = await prisma.otpCode.findFirst({
      where: { email: e, purpose: 'register', consumed: false, expires_at: { gt: new Date() } },
      orderBy: { created_at: 'desc' },
    });
    if (!rec || rec.code !== String(otpCode)) return res.status(400).json({ error: 'Código inválido o expirado' });
    await prisma.otpCode.update({ where: { id: rec.id }, data: { consumed: true } });
    const user = await prisma.user.update({ where: { email: e }, data: { email_verified: true } });
    const tokens = await issueTokens(user);
    res.json({
      ...tokens,
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role, data: user.data },
    });
  } catch (e) { next(e); }
});

authRouter.post('/resend-otp', async (req, res, next) => {
  try {
    const { email } = req.body;
    const e = String(email || '').toLowerCase();
    const code = await createOtp(e, 'register');
    console.log(`[otp] resend ${e} → código: ${code}`);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// --- Reset password (air-gap: se resetea con OTP también) ---
authRouter.post('/reset-request', async (req, res) => {
  const { email } = req.body;
  const e = String(email || '').toLowerCase();
  const code = await createOtp(e, 'reset');
  console.log(`[otp] reset ${e} → código: ${code}`);
  // Respuesta genérica por seguridad (no revela si existe).
  res.json({ ok: true, message: 'Si el email existe, se generó un código (ver log del servidor).' });
});

authRouter.post('/reset-confirm', async (req, res, next) => {
  try {
    const { email, otpCode, newPassword } = req.body;
    const e = String(email || '').toLowerCase();
    const rec = await prisma.otpCode.findFirst({
      where: { email: e, purpose: 'reset', consumed: false, expires_at: { gt: new Date() } },
      orderBy: { created_at: 'desc' },
    });
    if (!rec || rec.code !== String(otpCode)) return res.status(400).json({ error: 'Código inválido o expirado' });
    await prisma.otpCode.update({ where: { id: rec.id }, data: { consumed: true } });
    const user = await prisma.user.update({ where: { email: e }, data: { password_hash: hashPassword(newPassword) } });
    const tokens = await issueTokens(user);
    res.json({ ...tokens, user: { id: user.id, email: user.email, role: user.role } });
  } catch (e) { next(e); }
});

// --- Refresh ---
authRouter.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const payload = verifyRefreshToken(refreshToken);
    if (!payload) return res.status(401).json({ error: 'Refresh inválido' });
    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.revoked) return res.status(401).json({ error: 'Refresh revocado' });
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: 'Usuario inexistente' });
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });
    const tokens = await issueTokens(user);
    res.json(tokens);
  } catch (e) { next(e); }
});

// --- Me / logout ---
authRouter.get('/me', async (req, res, next) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const payload = token ? verifyAccessToken(token) : null;
    if (!payload) return res.status(401).json({ error: 'No autenticado' });
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: 'No autenticado' });
    res.json({ id: user.id, email: user.email, full_name: user.full_name, role: user.role, data: user.data });
  } catch (e) { next(e); }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) await prisma.refreshToken.updateMany({ where: { token: refreshToken }, data: { revoked: true } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Helper interno: crea OTP vigente.
async function createOtp(email, purpose) {
  const code = genOtp();
  await prisma.otpCode.create({
    data: { email, code, purpose, expires_at: new Date(Date.now() + env.otpTtlMinutes * 60 * 1000) },
  });
  return code;
}