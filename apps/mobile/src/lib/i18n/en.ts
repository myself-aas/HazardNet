/**
 * Strings — English source for Phase 8 l10n.
 *
 * Bangla translations are in `bn.ts`. The locale is chosen at runtime via
 * navigator language / device locale (see useLocale). Keys must be in English
 * so fallback is always sensible; Bengali is LTR so we do not need RTL layout
 * flips in Phase 8.
 *
 * Keys are intentionally flat (no nesting) to make spreadsheets / translator
 * handoff straightforward.
 */

export const en = {
  // Tabs
  'tab.today': 'Today',
  'tab.alerts': 'Alerts',
  'tab.map': 'Map',
  'tab.saved': 'Saved',
  'tab.more': 'More',

  // Today
  'today.myLocation': 'My location',
  'today.updated': 'Updated {age}',
  'today.changeLocation': 'Use my location',
  'today.useNational': 'National',
  'today.locating': 'Locating…',
  'today.youHere': 'You are here',
  'today.denied': 'Location permission denied',
  'today.allClear': 'All clear',
  'today.activeAlerts': 'Active alerts',
  'today.seeAllAlerts': 'See all {n} alerts →',
  'today.conditions': "Today's conditions",
  'today.viewAlert': 'View alert →',
  'today.seeInstructions': 'See instructions →',
  'today.noAlerts': 'No active alerts',
  'today.noAlertsBody': 'No alerts are published above the WATCH threshold at this time. Pull down to refresh.',
  'today.refresh': 'Refresh',

  // Alerts
  'alerts.title': 'Alerts',
  'alerts.none': 'No active alerts',
  'alerts.filter.all': 'All',
  'alerts.filter.severe': 'Severe',
  'alerts.filter.warning': 'Warning',
  'alerts.filter.watch': 'Watch',
  'alerts.search': 'Search districts…',

  // Map
  'map.severe': 'Severe',
  'map.warning': 'Warning',
  'map.watch': 'Watch',
  'map.noAlerts': 'No alerts',
  'map.recenter': 'Recenter on my location',
  'map.recenterDenied': 'Location permission denied — open settings',
  'map.layers': 'Layer controls',
  'map.divisions': 'Divisions',
  'map.layerPolygon': 'Division severity layer',
  'map.layerAlerts': 'Alert markers',
  'map.layersFuture': 'District polygons and satellite tiles land in a future update.',
  'map.noAlertsFor': 'No active alerts for {division}. Showing national data.',
  'map.close': 'Close',
  'map.accessibleSummary': '{n} alerts in viewport across {divisions} divisions.',

  // Saved
  'saved.title': 'Saved places',
  'saved.emptyHeadline': 'Saved places',
  'saved.emptyBody': 'Save home, work, and family locations to get alerts specific to those places. Data stays on this device.',
  'saved.addFirst': 'Add your first place',
  'saved.add': '+ Add a place',
  'saved.currentLocation': 'Current location',
  'saved.useMyLocation': 'Use my location',
  'saved.enterManually': 'Enter manually',
  'saved.saveCurrent': 'Save current location',
  'saved.placeNamePlaceholder': 'e.g. Home, Parents in Kurigram',
  'saved.savePlace': 'Save place',
  'saved.openSettings': 'Open settings',
  'saved.noLocationSet': 'No location set',
  'saved.national': 'National',
  'saved.alertsOn': 'Alerts on',
  'saved.alertsOff': 'Off',
  'saved.longPressHint': 'Saved places stay on this device. Long-press a place to delete.',
  'saved.removeTitle': 'Remove {label}?',
  'saved.removeBody': 'You will stop receiving notifications for this place.',
  'saved.cancel': 'Cancel',
  'saved.remove': 'Remove',
  'saved.locationAccessTitle': 'Location access',
  'saved.locationAccessBody': 'HazardNet uses your location only on-device to match alerts. It never leaves this device.',
  'saved.notNow': 'Not now',
  'saved.continue': 'Continue',
  'saved.couldNotGetLocation': 'Could not get location',
  'saved.couldNotGetLocationBody': 'Try again outside or add a place manually.',
  'saved.locationDeniedBody': 'Tap "Open settings" to grant access, or add a place manually.',

  // Saved place detail
  'place.details': 'Place',
  'place.alertsFor': 'Alerts for this place',
  'place.hazards': 'Hazard types',
  'place.quietHours': 'Quiet hours',
  'place.quietHoursHint': 'Suppress non-critical alerts overnight.',
  'place.quietHoursWindow': '22:00 – 07:00 (custom times in future update)',
  'place.severeBypasses': 'SEVERE alerts bypass quiet hours',
  'place.save': 'Save',
  'place.removeCta': 'Remove this place',

  // Location education
  'edu.location.title': 'Why we ask for location',
  'edu.location.body1': 'We only use your location to match alerts to where you are right now.',
  'edu.location.b1': '• Low-accuracy GPS picks your nearest division/district.',
  'edu.location.b2': '• Your location never leaves this device — matching happens on-device.',
  'edu.location.b3': '• You can deny permission and still use HazardNet in national mode.',
  'edu.location.later': 'Not now',
  'edu.location.enable': 'Continue',
  'edu.location.footer': 'You can change this later in Settings.',

  // Notifications
  'notif.title': 'Notifications',
  'notif.enable': 'Turn on notifications',
  'notif.enableBody': 'Allow alerts to appear when the app is closed.',
  'notif.deniedTitle': 'Notifications are off for this device',
  'notif.deniedBody': 'Open system settings to allow HazardNet to send alerts.',
  'notif.openSettings': 'Open settings',
  'notif.master': 'Enable alerts',
  'notif.masterBody': 'Master switch — when off, no notifications are sent.',
  'notif.sound': 'Sound',
  'notif.haptics': 'Haptics',
  'notif.criticalBypass': 'SEVERE bypasses quiet hours',
  'notif.criticalBypassBody': 'Life-threatening alerts sound even during Do-Not-Disturb / quiet hours.',
  'notif.quietHoursToggle': 'Suppress overnight',
  'notif.quietHoursBody': 'Non-SEVERE alerts are held 22:00–07:00 and summarised in the morning.',
  'notif.quietHoursWindow': '22:00 – 07:00',
  'notif.channels': 'Channels',
  'notif.perHazard': 'Per-hazard-type granularity is configured per saved place.',
  'notif.privacy': 'Hide details on lock screen',
  'notif.privacyBody': 'Show only "HazardNet alert" for shared phones.',
  'notif.test': 'Send test notification ({n})',
  'notif.testSent': 'Test sent',
  'notif.testSentBody': 'A test notification should appear momentarily.',
  'notif.testFailed': 'Could not send test',
  'notif.testFailedBody': 'Notifications may be unavailable on this device or simulator.',
  'notif.edu.title': 'Turn on alerts',
  'notif.edu.body1': 'Get notified when SEVERE weather affects your saved places.',
  'notif.edu.b1': '• Sound + vibration for severe cyclones, floods, and cold waves.',
  'notif.edu.b2': '• Quiet hours overnight — SEVERE alerts bypass quiet hours.',
  'notif.edu.b3': '• Tap a notification to jump straight to the alert.',
  'notif.edu.enable': 'Enable alerts',
  'notif.edu.later': 'Not now',
  'notif.edu.footer': 'You can turn this off any time in Settings.',

  // Reports
  'report.title': 'Submit a field report',
  'report.subtitle': 'Photos help BMD/DAE officers verify conditions. Reports are stored on-device until they upload.',
  'report.photo': 'Photo',
  'report.takePhoto': 'Take photo',
  'report.chooseLibrary': 'Choose from library',
  'report.remove': 'Remove',
  'report.cameraPerm': 'Permission needed',
  'report.cameraPermBody': 'Allow camera access to capture a new photo.',
  'report.libraryPermBody': 'Allow photo-library access to attach a photo.',
  'report.permDenied': 'Permission was denied. Enable access in system settings.',
  'report.details': 'Details',
  'report.captionPlaceholder': "Short description (e.g. 'Water 2ft above road in Kurigram sadar')",
  'report.hazardType': 'Hazard type',
  'report.attachLocation': 'Attach location',
  'report.attachLocationBody': 'Attach your current low-accuracy location (on-device only).',
  'report.pending': 'Pending uploads: {n}',
  'report.pendingBody': 'Reports auto-upload when connectivity returns.',
  'report.submit': 'Submit report',
  'report.addPhoto': 'Add a photo',
  'report.queuedTitle': 'Report queued',
  'report.queuedBody': 'Your report is saved on this device and will upload when connectivity returns.',
  'report.ok': 'OK',

  // Data status
  'data.title': 'Data status',

  // Accessibility
  'a11y.title': 'Accessibility',
  'a11y.theme': 'Theme',
  'a11y.system': 'System',
  'a11y.light': 'Light',
  'a11y.dark': 'Dark',
  'a11y.oled': 'OLED (true black)',
  'a11y.oledBody': 'OLED mode saves battery on AMOLED screens and reduces eye strain at night.',
  'a11y.largeText': 'Large text preview',
  'a11y.largeTextBody': 'Use larger default type sizes across the app (system Dynamic Type follows in Phase 8 polish).',
  'a11y.reducedMotion': 'Reduced motion',
  'a11y.reducedMotionBody': 'Disable non-essential animations (banners, transitions).',
  'a11y.haptics': 'Haptics',
  'a11y.hapticsBody': 'Vibration feedback for taps and alerts.',
  'a11y.phase8': 'Coming in a future update',
  'a11y.vo': '• VoiceOver / TalkBack full audit',
  'a11y.dt': '• System Dynamic Type up to 200%',
  'a11y.contrast': '• Increase contrast + Bold Text support',
  'a11y.mapA11y': '• Accessible mini-map summary',
  'a11y.bn': '• Bangla (বাংলা) localization with Noto Sans Bengali',

  // Articles
  'article.about': 'About HazardNet',
  'article.methodology': 'Methodology',
  'article.privacy': 'Privacy',
  'article.contact': 'Contact',

  // More
  'more.submit': 'Submit field report',
  'more.submitSub': 'Photo + caption + location; queues offline',
  'more.dataStatus': 'Data status',
  'more.dataStatusSub': 'Cache age, source availability',
  'more.notifications': 'Notification settings',
  'more.notificationsSub': 'Critical alerts, quiet hours, channels',
  'more.accessibility': 'Accessibility',
  'more.accessibilitySub': 'Theme, large text, reduced motion, haptics',
  'more.emergency': 'Contact emergency services',
  'more.website': 'Open hazardnet.live in browser',
  'more.version': 'HazardNet Mobile v2.2.0 · Offline-first · On-device privacy',
  'more.more': 'More',

  // Emergency CTA
  'cta.emergency': 'Call emergency services',
  'cta.disclaimer': 'HazardNet is an early-warning supplement, not an official government warning service. Follow official BMD/DAE bulletins and local authorities during emergencies.',

  // Severity
  'severity.severe': 'Severe',
  'severity.warning': 'Warning',
  'severity.watch': 'Watch',
  'severity.allClear': 'All clear',
} as const;

export type StringKey = keyof typeof en;
