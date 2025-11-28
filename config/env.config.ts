// config/env.config.ts
export const envConfig = {
  shopee: {
    cookies: process.env.PRIVATE_COOKIE || '',
    afAcEncDat: process.env.AF_AC_ENC_DAT || '937d8026c2036b48',
  },
  api: {
    timeout: parseInt(process.env.API_TIMEOUT || '10000'),
  }
};

// Type-safe config với validation
export function validateEnvConfig() {
  if (!process.env.PRIVATE_COOKIE) {
    console.warn('Warning: PRIVATE_COOKIES is not set');
  }
  
  return envConfig;
}