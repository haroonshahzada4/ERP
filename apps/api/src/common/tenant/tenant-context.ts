import { AsyncLocalStorage } from 'node:async_hooks';

export type TenantContextStore = {
  tenantId: number;
  tenantSlug: string;
  host: string;
};

export const tenantContextStorage = new AsyncLocalStorage<TenantContextStore>();

export function getTenantContext(): TenantContextStore | undefined {
  return tenantContextStorage.getStore();
}
