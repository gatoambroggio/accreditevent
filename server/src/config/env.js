import dotenv from 'dotenv';
dotenv.config();

const required = ['DATABASE_URL', 'JWT_SECRET', 'REFRESH_TOKEN_SECRET'];
for (const k of required) {
  if (!process.env[k]) {
    console.error(`[env] Falta la variable ${k}. Copiá .env.example a .env y completá los valores.`);
    process.exit(1);
  }
}

export const env = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    refreshSecret: process.env.REFRESH_TOKEN_SECRET,
    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d',
  },
  otpTtlMinutes: parseInt(process.env.OTP_TTL_MINUTES || '10', 10),
  lanBaseUrl: process.env.LAN_BASE_URL || `http://127.0.0.1:${process.env.PORT || 4000}`,
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  maxUploadBytes: (parseInt(process.env.MAX_UPLOAD_MB || '15', 10)) * 1024 * 1024,
  tesseractLang: process.env.TESSERACT_LANG || 'eng',
  smtpEnabled: process.env.SMTP_ENABLED === 'true',
};