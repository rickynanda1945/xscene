export class ConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigurationError";
    this.code = "CONFIGURATION_ERROR";
  }
}

export function databaseConfig(env = process.env) {
  const missing = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"].filter(
    (key) => !env[key]?.trim(),
  );
  if (missing.length) {
    throw new ConfigurationError(
      `Missing ${missing.join(", ")}. Configure runtime Environment or the private /run/xscene.env File Mount. Values saved in the panel must reach the container.`,
    );
  }
  for (const key of ["DB_HOST", "DB_NAME", "DB_USER"]) {
    if (env[key] !== env[key].trim()) {
      throw new ConfigurationError(`${key} must not have surrounding whitespace.`);
    }
  }
  const port = Number(env.DB_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigurationError("DB_PORT must be an integer between 1 and 65535.");
  }
  return {
    host: env.DB_HOST,
    port,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    connectTimeout: 10000,
  };
}

export function validateApplicationConfig(env = process.env) {
  databaseConfig(env);
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) {
    throw new ConfigurationError("AUTH_SECRET must contain at least 32 random characters.");
  }
  let url;
  try {
    url = new URL(env.APP_URL);
  } catch {
    throw new ConfigurationError("APP_URL must be a complete application URL.");
  }
  if (
    url.username || url.password || url.search || url.hash ||
    url.pathname !== "/" ||
    !["http:", "https:"].includes(url.protocol) ||
    (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname))
  ) {
    throw new ConfigurationError("APP_URL must be an HTTPS origin, such as https://xscene.xboss.asia (HTTP is allowed for localhost).");
  }
  if (!["true", "false"].includes(env.AUTO_MIGRATE ?? "true")) {
    throw new ConfigurationError("AUTO_MIGRATE must be true or false.");
  }
}
