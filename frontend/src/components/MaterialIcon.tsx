import React from 'react';

export interface MaterialIconProps {
  name: string;
  className?: string;
  style?: React.CSSProperties;
  size?: number | string;
  filled?: boolean;
  title?: string;
  ariaLabel?: string;
}

/**
 * Authentic SVG Vector Icon System for HazardNet.
 * Replaces text-based Material 3 / font ligature icons with crisp, high-contrast, scalable SVG graphics.
 * Fully supports brand icons (GitHub, Firebase, Android, Windows, Apple/Mac, Linux, Python, NASA),
 * Hazard indicators (Flood, Cyclone, Drought, Storm, Cold Wave, Fire, Flash Flood),
 * GIS/Remote Sensing, AI Advisor, Emergency Alerts, and standard UI controls.
 */
export const MaterialIcon: React.FC<MaterialIconProps> = ({
  name,
  className = '',
  style,
  size,
  filled = false,
  title,
  ariaLabel,
}) => {
  // Normalize icon key (lowercase, trim, remove symbols)
  const key = (name || '').toLowerCase().trim().replace(/[-\s]+/g, '_');

  const renderIconSvg = () => {
    switch (key) {
      // ─── BRAND & PLATFORM ICONS ───
      case 'github':
        return (
          <path
            d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
            fill="currentColor"
          />
        );

      case 'android':
      case 'smartphone':
        return (
          <>
            <path d="M5 16v-6a7 7 0 0 1 14 0v6M9 9h.01M15 9h.01M6.5 4.5l1.5 2.5M17.5 4.5l-1.5 2.5M4 11h16v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7zm4 9v2m8-2v2" />
          </>
        );

      case 'windows':
        return (
          <path
            d="M3 5.5l7-1v7H3v-6zm8.5-1.2l9.5-1.3v8.5h-9.5v-7.2zM3 13.5h7v7l-7-1v-6zm8.5 0H21v8.5l-9.5-1.3v-7.2z"
            fill="currentColor"
          />
        );

      case 'apple':
      case 'mac':
      case 'laptop_mac':
      case 'macos':
        return (
          <path
            d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.16c.62-.75 1.04-1.8 0.93-2.85-.9.04-1.99.6-2.64 1.35-.57.65-1.07 1.72-.94 2.74 1.01.08 2.03-.49 2.65-1.24z"
            fill="currentColor"
          />
        );

      case 'linux':
      case 'terminal':
      case 'cli':
        return (
          <>
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" x2="20" y1="19" y2="19" />
          </>
        );

      case 'python':
      case 'code':
        return (
          <>
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </>
        );

      case 'firebase':
      case 'firebase_db':
      case 'firebase_auth':
        return (
          <path
            d="M4.5 17.5L6.8 3.2a.8.8 0 0 1 1.4-.4L12 10.5l-7.5 7zm15 0L17.2 6.5a.8.8 0 0 0-1.5-.2L12 10.5l7.5 7zm-7.5-7l-3.2-6.1a.8.8 0 0 0-1.5.1L4.5 17.5 12 21.8l7.5-4.3L12 10.5z"
            fill="currentColor"
          />
        );

      case 'nasa':
      case 'radar':
      case 'spacecraft':
      case 'orbit':
        return (
          <>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            <path d="M2 12h20" />
            <circle cx="12" cy="12" r="3" fill="currentColor" />
          </>
        );

      // ─── AI ADVISOR & INTELLIGENCE ───
      case 'ai_advisor':
      case 'psychology':
      case 'brain':
      case 'smart_toy':
      case 'sparkles':
      case 'ai':
        return (
          <>
            <path d="M12 3l2 4.5 4.5 2-4.5 2-2 4.5-2-4.5-4.5-2 4.5-2L12 3z" fill={filled ? 'currentColor' : 'none'} />
            <path d="M19 15l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1L19 15z" fill={filled ? 'currentColor' : 'none'} />
            <path d="M5 4l.8 1.8 1.8.8-1.8.8L5 9.2l-.8-1.8L2.4 6.6l1.8-.8L5 4z" fill={filled ? 'currentColor' : 'none'} />
          </>
        );

      // ─── GIS & SATELLITE ───
      case 'gis':
      case 'public':
      case 'globe':
      case 'earth':
        return (
          <>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20" />
          </>
        );

      case 'satellite':
      case 'satellite_alt':
        return (
          <>
            <path d="M13 7 9 3 5 7l4 4M17 11l4 4-4 4-4-4M8 12l8 8M14 8l2 2M10 12l2 2M6 16l2 2M2 22l3-3" />
          </>
        );

      case 'map':
        return (
          <>
            <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
            <line x1="9" x2="9" y1="3" y2="18" />
            <line x1="15" x2="15" y1="6" y2="21" />
          </>
        );

      case 'layers':
      case 'map_layer':
        return (
          <>
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </>
        );

      // ─── SEARCH & CLOSE ───
      case 'search':
        return (
          <>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </>
        );

      case 'close':
      case 'cancel':
      case 'x':
      case 'clear':
        return (
          <>
            <path d="M18 6 6 18M6 6l12 12" />
          </>
        );

      // ─── SETTINGS, PINNED, SAVED ───
      case 'settings':
      case 'gear':
      case 'tune':
        return (
          <>
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </>
        );

      case 'push_pin':
      case 'pin':
      case 'pinned':
        return (
          <>
            <path d="M12 17v5M9 4h6M9 4v5l-3 3v2h12v-2l-3-3V4" fill={filled ? 'currentColor' : 'none'} />
          </>
        );

      case 'bookmark':
      case 'bookmarks':
      case 'saved':
      case 'save':
        return (
          <>
            <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" fill={filled ? 'currentColor' : 'none'} />
          </>
        );

      // ─── CLOUD SYNC & TRANSFER ───
      case 'cloud_sync':
      case 'cloud':
        return (
          <>
            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
            <path d="M11 13a2 2 0 0 1 2-2h2m-2 6a2 2 0 0 1-2-2v-2" />
          </>
        );

      case 'cloud_upload':
      case 'upload':
        return (
          <>
            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
            <polyline points="16 16 12 12 8 16" />
            <line x1="12" x2="12" y1="12" y2="21" />
          </>
        );

      case 'download':
      case 'cloud_download':
        return (
          <>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" x2="12" y1="15" y2="3" />
          </>
        );

      // ─── HAZARDS ───
      case 'water':
      case 'water_drop':
      case 'flood':
      case 'monsoon_flood':
      case 'flash_flood':
        return (
          <>
            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" fill={filled ? 'currentColor' : 'none'} />
          </>
        );

      case 'cyclone':
      case 'tropical_cyclone':
      case 'storm':
        return (
          <>
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm0-13a5 5 0 1 0 5 5 5 5 0 0 0-5-5zm0 7a2 2 0 1 1 2-2 2 2 0 0 1-2 2z" />
          </>
        );

      case 'sunny':
      case 'sun':
      case 'drought':
      case 'heat':
        return (
          <>
            <circle cx="12" cy="12" r="4" fill={filled ? 'currentColor' : 'none'} />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </>
        );

      case 'rainy':
      case 'rain':
        return (
          <>
            <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
            <path d="M8 19v2M8 13v2M12 21v2M12 15v2M16 19v2M16 13v2" />
          </>
        );

      case 'ac_unit':
      case 'cold_wave':
      case 'snow':
      case 'snowflake':
        return (
          <>
            <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07L19.07 4.93M8 4l4 4 4-4M8 20l4-4 4 4M4 8l4 4-4 4M20 8l-4 4 4 4" />
          </>
        );

      case 'bolt':
      case 'thunderstorm':
      case 'lightning':
      case 'electric_bolt':
        return (
          <>
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill={filled ? 'currentColor' : 'none'} />
          </>
        );

      case 'local_fire_department':
      case 'fire':
      case 'flame':
      case 'wildfire':
        return (
          <>
            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" fill={filled ? 'currentColor' : 'none'} />
          </>
        );

      case 'dry':
      case 'arid':
        return (
          <>
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </>
        );

      // ─── SEVERITY & ANALYTICS ───
      case 'severity':
      case 'analytics':
      case 'insights':
      case 'monitoring':
      case 'query_stats':
      case 'bar_chart':
      case 'speedometer':
      case 'gauge':
        return (
          <>
            <path d="M3 3v18h18M18 17V9M13 17V5M8 17v-3" />
          </>
        );

      // ─── ALERTS & NOTIFICATIONS ───
      case 'alerts':
      case 'emergency':
      case 'warning':
      case 'shield_alert':
        return (
          <>
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" x2="12" y1="9" y2="13" />
            <line x1="12" x2="12.01" y1="17" y2="17" />
          </>
        );

      case 'notifications':
      case 'notifications_active':
      case 'bell':
        return (
          <>
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </>
        );

      // ─── LOCATION & GPS ───
      case 'location_on':
      case 'place':
      case 'pin_drop':
        return (
          <>
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" fill={filled ? 'currentColor' : 'none'} />
            <circle cx="12" cy="10" r="3" />
          </>
        );

      case 'my_location':
      case 'person_pin_circle':
      case 'gps_fixed':
        return (
          <>
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" fill={filled ? 'currentColor' : 'none'} />
            <line x1="12" x2="12" y1="2" y2="6" />
            <line x1="12" x2="12" y1="18" y2="22" />
            <line x1="2" x2="6" y1="12" y2="12" />
            <line x1="18" x2="22" y1="12" y2="12" />
          </>
        );

      case 'home':
        return (
          <>
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </>
        );

      // ─── CHEVRONS & NAVIGATION ───
      case 'chevron_down':
      case 'expand_more':
      case 'arrow_drop_down':
        return <polyline points="6 9 12 15 18 9" />;

      case 'chevron_up':
      case 'expand_less':
      case 'arrow_drop_up':
        return <polyline points="18 15 12 9 6 15" />;

      case 'chevron_left':
      case 'arrow_back':
        return (
          <>
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </>
        );

      case 'chevron_right':
      case 'arrow_forward':
        return (
          <>
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </>
        );

      case 'menu':
        return (
          <>
            <line x1="4" x2="20" y1="12" y2="12" />
            <line x1="4" x2="20" y1="6" y2="6" />
            <line x1="4" x2="20" y1="18" y2="18" />
          </>
        );

      case 'more_vert':
        return (
          <>
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="19" r="1" />
          </>
        );

      // ─── UTILITIES, REFRESH, DELETE, CHECK ───
      case 'refresh':
      case 'autorenew':
      case 'sync':
        return (
          <>
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M3 21v-5h5" />
          </>
        );

      case 'delete':
      case 'trash':
        return (
          <>
            <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6" />
          </>
        );

      case 'check_circle':
      case 'check':
      case 'done':
        return (
          <>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </>
        );

      case 'lightbulb':
      case 'tips':
        return (
          <>
            <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2z" />
          </>
        );

      case 'shield':
      case 'verified_user':
      case 'security':
        return (
          <>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <polyline points="9 12 11 14 15 10" />
          </>
        );

      case 'key':
        return (
          <>
            <path d="m15.5 8.5 2 2M14 7l2 2M21 2l-9.6 9.6M9 15a4.24 4.24 0 1 1-6-6 4.24 4.24 0 0 1 6 6Z" />
          </>
        );

      case 'lock':
        return (
          <>
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </>
        );

      case 'logout':
      case 'door':
        return (
          <>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </>
        );

      case 'person':
      case 'account_circle':
      case 'user':
        return (
          <>
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </>
        );

      case 'photo_camera':
      case 'camera':
        return (
          <>
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
            <circle cx="12" cy="13" r="3" />
          </>
        );

      case 'content_copy':
      case 'copy':
        return (
          <>
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </>
        );

      case 'ios_share':
      case 'share':
        return (
          <>
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />
          </>
        );

      case 'send':
        return (
          <>
            <path d="m22 2-7 20-4-9-9-4Z" />
            <path d="M22 2 11 13" />
          </>
        );

      case 'mail':
      case 'email':
        return (
          <>
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </>
        );

      case 'agriculture':
      case 'grass':
      case 'crop':
      case 'wheat':
        return (
          <>
            <path d="M7 20h10M12 20V10M12 10a4 4 0 0 0 4-4 4 4 0 0 0-4-4 4 4 0 0 0-4 4 4 4 0 0 0 4 4zm0 4a4 4 0 0 1-4-4 4 4 0 0 1 4-4" />
          </>
        );

      case 'pets':
      case 'livestock':
        return (
          <>
            <circle cx="4.5" cy="9.5" r="2.5" />
            <circle cx="9" cy="5.5" r="2.5" />
            <circle cx="15" cy="5.5" r="2.5" />
            <circle cx="19.5" cy="9.5" r="2.5" />
            <path d="M12 13c-3 0-6 2-6 5 0 2.2 2.7 4 6 4s6-1.8 6-4c0-3-3-5-6-5z" />
          </>
        );

      case 'medical_services':
      case 'health_and_safety':
      case 'hospital':
        return (
          <>
            <path d="M12 2v20M2 12h20M12 2a10 10 0 1 0 10 10" />
          </>
        );

      case 'calendar_month':
      case 'event_note':
      case 'calendar':
        return (
          <>
            <rect width="18" height="18" x="3" y="4" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
          </>
        );

      case 'description':
      case 'article':
      case 'menu_book':
      case 'doc':
      case 'file':
        return (
          <>
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
            <path d="M6 6h10M6 10h10M6 14h6" />
          </>
        );

      case 'folder':
      case 'folder_open':
        return (
          <>
            <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
          </>
        );

      case 'history':
        return (
          <>
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l4 2" />
          </>
        );

      case 'info':
      case 'help':
        return (
          <>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </>
        );

      case 'balance':
        return (
          <>
            <path d="m3 7 9-4 9 4M12 3v18M5 7v4a4 4 0 0 0 4 4M19 7v4a4 4 0 0 1-4 4M5 21h14" />
          </>
        );

      case 'compare_arrows':
        return (
          <>
            <path d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4" />
          </>
        );

      case 'functions':
        return (
          <>
            <path d="M18 4H6l7 8-7 8h12" />
          </>
        );

      case 'alt_route':
        return (
          <>
            <circle cx="6" cy="19" r="2" />
            <circle cx="6" cy="5" r="2" />
            <circle cx="18" cy="5" r="2" />
            <path d="M6 7v10M18 7v4a3 3 0 0 1-3 3H6" />
          </>
        );

      case 'hub':
        return (
          <>
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" />
            <line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />
          </>
        );

      case 'rss_feed':
        return (
          <>
            <path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16M5 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
          </>
        );

      // Default clean fallback (Never renders text ligatures)
      default:
        return (
          <>
            <circle cx="12" cy="12" r="8" strokeDasharray="3 3" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
          </>
        );
    }
  };

  const computedSize = size || '1em';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={filled ? 0 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={"select-none inline-block shrink-0 align-middle " + className}
      style={{
        width: computedSize,
        height: computedSize,
        ...style,
      }}
      aria-hidden={!title && !ariaLabel}
      role={title || ariaLabel ? 'img' : 'presentation'}
    >
      {title && <title>{title}</title>}
      {renderIconSvg()}
    </svg>
  );
};

export default MaterialIcon;
