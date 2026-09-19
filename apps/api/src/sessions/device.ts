import type { DeviceInfo, DeviceType } from '@asas/shared';

/**
 * Best-effort device detection from Client Hints and the User-Agent header (spec §5.2).
 * Never throws; failure yields 'Unknown' so participation is never blocked.
 */
export function detectDevice(headers: Record<string, string | string[] | undefined>): DeviceInfo {
  const h = (name: string): string => {
    const v = headers[name.toLowerCase()];
    return (Array.isArray(v) ? v[0] : v) ?? '';
  };
  const ua = h('user-agent');
  const chModel = h('sec-ch-ua-model').replace(/"/g, '').trim();
  const chPlatform = h('sec-ch-ua-platform').replace(/"/g, '').trim();
  const chMobile = h('sec-ch-ua-mobile') === '?1';

  let deviceType: DeviceType = 'Unknown';
  let os: string | null = null;
  let model: string | null = chModel || null;

  if (/iPhone/i.test(ua)) {
    deviceType = 'iPhone';
    os = iosVersion(ua);
    model = model ?? 'iPhone';
  } else if (/iPad/i.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua))) {
    deviceType = 'iPad or tablet';
    os = iosVersion(ua) ?? 'iPadOS';
  } else if (/Android/i.test(ua)) {
    deviceType = /Mobile/i.test(ua) || chMobile ? 'Android phone' : 'iPad or tablet';
    const v = /Android\s([\d.]+)/i.exec(ua);
    os = v ? `Android ${v[1]}` : 'Android';
    if (!model) {
      const m = /Android[^;]*;\s*([^;)]+?)(?:\sBuild|\))/i.exec(ua);
      model = m && m[1] && !/^[a-z]{2}-[a-z]{2}$/i.test(m[1].trim()) ? m[1].trim() : null;
    }
  } else if (/Windows|Macintosh|Linux|CrOS/i.test(ua) || chPlatform) {
    deviceType = 'Desktop or laptop';
    os = chPlatform || (/Windows/i.test(ua) ? 'Windows' : /Macintosh/i.test(ua) ? 'macOS' : /CrOS/i.test(ua) ? 'ChromeOS' : 'Linux');
  }

  return {
    deviceType,
    model,
    os,
    browser: browserName(ua),
    detectionSource: chModel || chPlatform ? 'client-hints' : ua ? 'user-agent' : 'none',
  };
}

function iosVersion(ua: string): string | null {
  const m = /OS (\d+)[_.](\d+)/.exec(ua);
  return m ? `iOS ${m[1]}.${m[2]}` : null;
}

function browserName(ua: string): string | null {
  if (!ua) return null;
  if (/EdgA?\//.test(ua)) return 'Edge';
  if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet';
  if (/CriOS\//.test(ua)) return 'Chrome (iOS)';
  if (/FxiOS\//.test(ua)) return 'Firefox (iOS)';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return 'Safari';
  return 'Other';
}
