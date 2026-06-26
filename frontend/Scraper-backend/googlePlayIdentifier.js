function isValidGooglePlayPackageName(value) {
  const normalized = String(value || '').trim();
  return /^[a-zA-Z0-9._-]+$/.test(normalized) && normalized.includes('.');
}

function parseGooglePlayIdentifier(identifier) {
  const original = identifier;
  const normalized = String(identifier || '').trim();

  if (!normalized) {
    return {
      type: 'invalid',
      value: '',
      original,
      parsed: null,
    };
  }

  // Plain package name.
  if (isValidGooglePlayPackageName(normalized)) {
    return {
      type: 'package_name',
      value: normalized,
      original,
      parsed: normalized,
    };
  }

  // market://details?id=com.example.app
  if (normalized.toLowerCase().startsWith('market://')) {
    try {
      const url = new URL(normalized);
      const packageId = (url.searchParams.get('id') || '').trim();
      if (isValidGooglePlayPackageName(packageId)) {
        return {
          type: 'market_url',
          value: packageId,
          original,
          parsed: packageId,
        };
      }
    } catch (_) {
      // Ignore URL parsing failures and continue.
    }
  }

  // https://play.google.com/store/apps/details?id=com.example.app
  try {
    const url = new URL(normalized);
    const hostname = (url.hostname || '').toLowerCase();
    const pathname = (url.pathname || '').toLowerCase();
    const isPlayDomain = hostname === 'play.google.com' || hostname === 'market.android.com';
    const isDetailsPath = pathname.includes('/store/apps/details');
    if (isPlayDomain && isDetailsPath) {
      const packageId = (url.searchParams.get('id') || '').trim();
      if (isValidGooglePlayPackageName(packageId)) {
        return {
          type: 'play_store_url',
          value: packageId,
          original,
          parsed: packageId,
        };
      }
    }
  } catch (_) {
    // Ignore URL parsing failures and continue.
  }

  return {
    type: 'invalid',
    value: normalized,
    original,
    parsed: null,
  };
}

module.exports = {
  parseGooglePlayIdentifier,
  isValidGooglePlayPackageName,
};
