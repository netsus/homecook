import {
  getAuthAuthority,
  getAuthSupabaseEnv as readAuthSupabaseEnv,
  getAuthSupabaseServerEnv as readAuthSupabaseServerEnv,
  getAuthSupabaseSecretKey,
  hasAuthSupabasePublicEnv,
} from "./auth-env";

export { getAuthAuthority };
import {
  getDataSupabaseEnv as readDataSupabaseEnv,
  getDataSupabaseSecretKey,
  getLocalDataSupabaseSecretKey,
} from "./data-env";

export function getAuthSupabaseEnv() {
  const env = readAuthSupabaseEnv();
  return {
    url: env.url,
    anonKey: env.publishableKey,
    issuer: env.issuer,
    jwksUrl: env.jwksUrl,
  };
}

export function getAuthSupabaseServerEnv() {
  const env = readAuthSupabaseServerEnv();
  return {
    url: env.url,
    anonKey: env.publishableKey,
    issuer: env.issuer,
    jwksUrl: env.jwksUrl,
  };
}

export function getDataSupabaseEnv() {
  const env = readDataSupabaseEnv();
  return {
    authority: env.authority,
    url: env.url,
    anonKey: env.publishableKey,
  };
}

export function getLocalDataEnv() {
  return getDataSupabaseEnv();
}

/**
 * Legacy compatibility adapter. New code must choose the explicit Auth or Data
 * environment helper instead of relying on this alias.
 */
export function getSupabaseEnv() {
  return getDataSupabaseEnv();
}

export function hasSupabasePublicEnv() {
  return hasAuthSupabasePublicEnv();
}

export function hasDataSupabaseEnv() {
  try {
    getDataSupabaseEnv();
    return true;
  } catch {
    return false;
  }
}

export function getServiceRoleKey() {
  return getDataSupabaseSecretKey();
}

export function getDataServiceRoleKey() {
  return getDataSupabaseSecretKey();
}

export function getLocalDataServiceRoleKey() {
  return getLocalDataSupabaseSecretKey();
}

export function getAuthServiceRoleKey() {
  return getAuthSupabaseSecretKey();
}

export const AUTH_ENV_VARS = {
  urlVarName: "NEXT_PUBLIC_AUTH_SUPABASE_URL",
  publishableVarName: "NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY",
  secretVarName: "AUTH_SUPABASE_SECRET_KEY",
  issuerVarName: "AUTH_SUPABASE_EXPECTED_ISSUER",
  jwksVarName: "AUTH_SUPABASE_JWKS_URL",
} as const;

export const DATA_ENV_VARS = {
  urlVarName: "DATA_SUPABASE_URL",
  publishableVarName: "DATA_SUPABASE_PUBLISHABLE_KEY",
  secretVarName: "DATA_SUPABASE_SECRET_KEY",
} as const;
