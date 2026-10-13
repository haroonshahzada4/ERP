/**
 * Company workspaces are identified by subdomain, e.g. horizon.localhost.
 * Apex hosts (localhost / 127.0.0.1) are reserved for Platform Super Admin login.
 */
export function resolveTenantHost(): string | null {
  const host = window.location.hostname.toLowerCase().split(':')[0];
  if (!host || host === 'localhost' || host === '127.0.0.1') return null;
  return host;
}

export function isApexHost() {
  return resolveTenantHost() === null;
}

/** True when the browser host belongs to the signed-in company. */
export function hostMatchesTenant(
  host: string,
  tenant: { slug: string; host?: string },
) {
  if (tenant.host && host === tenant.host) return true;
  return host === `${tenant.slug}.localhost`;
}
