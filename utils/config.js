// utils/config.js
const requiredEnvVars = ['MONGO_URI', 'TEXTBW_PASSWORD'];

function validateEnv() {
  const missing = requiredEnvVars.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[FATAL] Missing environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
  // Note: RESPONDIO_API_TOKEN is NO LONGER needed in v2.0
  console.log('[Config] All required environment variables present');
}

module.exports = { validateEnv };
