import { SetMetadata } from '@nestjs/common';

export const FEATURES_KEY = 'required_features';

/**
 * Require these feature entitlements for the host-resolved tenant.
 * Checked separately from RBAC (Feature enabled AND user authorized).
 */
export const RequireFeatures = (...features: string[]) =>
  SetMetadata(FEATURES_KEY, features);
