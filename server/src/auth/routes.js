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

// --- Update me (perfil extendido: company, full_name, etc.) ---
authRouter.put('/me', async (req, res, next) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const payload = token ? verifyAccessToken(token) : null;
    if (!payload) return res.status(401).json({ error: 'No autenticado' });
    const { full_name, data } = req.body;
    const update = {};
    if (full_name !== undefined) update.full_name = full_name;
    if (data !== undefined) update.data = data;
    const user = await prisma.user.update({ where: { id: payload.sub }, data: update });
    res.json({ id: user.id, email: user.email, full_name: user.full_name, role: user.role, data: user.data });
  } catch (e) { next(e); }
});

// --- Invite user (air-gap: crea con temp password, no envía email) ---
authRouter.post('/invite', async (req, res, next) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const payload = token ? verifyAccessToken(token) : null;
    if (!payload) return res.status(401).json({ error: 'No autenticado' });
    const caller = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!['superadmin', 'admin', 'productora'].includes(caller.role)) return res.status(403).json({ error: 'Forbidden' });
    const { email, role } = req.body;
    const e = String(email || '').toLowerCase();
    if (!e) return res.status(400).json({ error: 'Email requerido' });
    const exists = await prisma.user.findUnique({ where: { email: e } });
    if (exists) return res.status(409).json({ error: 'Ya existe' });
    const created = await prisma.user.create({ data: { email: e, password_hash: hashPassword('cambiar123'), role: role || 'user', email_verified: true, data: {} } });
    res.json({ ok: true, id: created.id, message: 'Usuario creado con contraseña temporal "cambiar123"' });
  } catch (e) { next(e); }
});

// --- changePassword (propia o de otro con jerarquía) ---
authRouter.post('/change-password', async (req, res, next) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const payload = token ? verifyAccessToken(token) : null;
    if (!payload) return res.status(401).json({ error: 'No autenticado' });
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword || newPassword.length < 6) return res.status(400).json({ error: 'userId y newPassword (min 6) obligatorios' });
    const caller = await prisma.user.findUnique({ where: { id: payload.sub } });
    const HIER = { superadmin: 5, admin: 4, productora: 3, coordinator: 2, control: 1, provider: 0 };
    if (userId !== caller.id && (HIER[caller.role] ?? -1) < 4) return res.status(403).json({ error: 'Solo puedes cambiar tu propia contraseña' });
    if (userId !== caller.id) {
      const target = await prisma.user.findUnique({ where: { id: userId } });
      if ((HIER[target.role] ?? -1) >= (HIER[caller.role] ?? -1)) return res.status(403).json({ error: 'No puedes cambiar la contraseña de un usuario con rol igual o superior' });
    }
    await prisma.user.update({ where: { id: userId }, data: { password_hash: hashPassword(newPassword) } });
    res.json({ success: true });
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