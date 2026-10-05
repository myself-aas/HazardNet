/**
 * Strings — Bangla (বাংলা) translations.
 *
 * Phase 8 ships a curated, translation-complete set covering navigation,
 * alerts, saved places, notifications, and emergency CTAs. Missing keys fall
 * back to English (see useLocale).
 */

export const bn: Partial<Record<string, string>> = {
  // Tabs
  'tab.today': 'আজকের',
  'tab.alerts': 'সতর্কতা',
  'tab.map': 'মানচিত্র',
  'tab.saved': 'সংরক্ষিত',
  'tab.more': 'আরও',

  // Today
  'today.myLocation': 'আমার অবস্থান',
  'today.updated': 'আপডেট হয়েছে {age}',
  'today.useNational': 'বাংলাদেশ',
  'today.locating': 'অবস্থান নির্ণয় করা হচ্ছে…',
  'today.youHere': 'আপনি এখানে',
  'today.denied': 'অবস্থানের অনুমতি নেই',
  'today.allClear': 'সব ঠিক আছে',
  'today.activeAlerts': 'সক্রিয় সতর্কতা',
  'today.refresh': 'রিফ্রেশ',
  'today.noAlerts': 'কোনো সক্রিয় সতর্কতা নেই',
  'today.noAlertsBody': 'এই মুহূর্তে WATCH সীমার উপরে কোনো সতর্কতা জারি নেই। রিফ্রেশ করতে নিচে টানুন।',

  // Alerts
  'alerts.title': 'সতর্কতা',
  'alerts.none': 'কোনো সক্রিয় সতর্কতা নেই',
  'alerts.filter.all': 'সব',
  'alerts.filter.severe': 'মারাত্মক',
  'alerts.filter.warning': 'সতর্কতা',
  'alerts.filter.watch': 'নজরদারি',
  'alerts.search': 'জেলা খুঁজুন…',

  // Map
  'map.severe': 'মারাত্মক',
  'map.warning': 'সতর্কতা',
  'map.watch': 'নজরদারি',
  'map.noAlerts': 'কোনো সতর্কতা নেই',
  'map.recenter': 'আমার অবস্থানে ফিরে যান',
  'map.recenterDenied': 'অবস্থানের অনুমতি নেই। সেটিংস খুলুন',
  'map.layers': 'লেয়ার',
  'map.close': 'বন্ধ করুন',

  // Saved
  'saved.title': 'সংরক্ষিত স্থান',
  'saved.emptyHeadline': 'সংরক্ষিত স্থান',
  'saved.addFirst': 'আপনার প্রথম স্থান যোগ করুন',
  'saved.add': '+ একটি স্থান যোগ করুন',
  'saved.currentLocation': 'বর্তমান অবস্থান',
  'saved.useMyLocation': 'আমার অবস্থান ব্যবহার করুন',
  'saved.enterManually': 'ম্যানুয়ালি লিখুন',
  'saved.saveCurrent': 'বর্তমান অবস্থান সংরক্ষণ করুন',
  'saved.savePlace': 'স্থান সংরক্ষণ করুন',
  'saved.alertsOn': 'সতর্কতা চালু',
  'saved.alertsOff': 'বন্ধ',
  'saved.cancel': 'বাতিল',
  'saved.remove': 'সরান',
  'saved.continue': 'চালিয়ে যান',
  'saved.notNow': 'এখন নয়',

  // Notifications
  'notif.title': 'বিজ্ঞপ্তি',
  'notif.enable': 'বিজ্ঞপ্তি চালু করুন',
  'notif.master': 'সতর্কতা চালু',
  'notif.sound': 'শব্দ',
  'notif.haptics': 'কম্পন',
  'notif.openSettings': 'সেটিংস খুলুন',
  'notif.save': 'সংরক্ষণ করুন',
  'notif.test': 'পরীক্ষামূলক বিজ্ঞপ্তি পাঠান ({n})',

  // Reports
  'report.title': 'ফিল্ড রিপোর্ট জমা দিন',
  'report.takePhoto': 'ছবি তুলুন',
  'report.chooseLibrary': 'লাইব্রেরি থেকে বাছুন',
  'report.submit': 'রিপোর্ট জমা দিন',
  'report.addPhoto': 'একটি ছবি যোগ করুন',
  'report.details': 'বিবরণ',
  'report.hazardType': 'দুর্যোগের ধরন',

  // Accessibility
  'a11y.title': 'অ্যাক্সেসিবিলিটি',
  'a11y.theme': 'থিম',
  'a11y.display': 'প্রদর্শন',
  'a11y.system': 'সিস্টেম',
  'a11y.light': 'লাইট',
  'a11y.dark': 'ডার্ক',
  'a11y.oled': 'OLED (সম্পূর্ণ কালো)',
  'a11y.oledBody': 'AMOLED পর্দায় OLED মোড ব্যাটারি সাশ্রয় করে এবং রাতে চোখের চাপ কমায়।',
  'a11y.boldText': 'গাঢ় লেখা',
  'a11y.boldTextBody': 'অ্যাপজুড়ে মোটা ফন্ট ব্যবহার করুন।',
  'a11y.increaseContrast': 'কনট্রাস্ট বাড়ান',
  'a11y.increaseContrastBody': 'সহজে পড়ার জন্য লেখা ও সীমানার কনট্রাস্ট বাড়ান।',
  'a11y.largeText': 'বড় লেখা',
  'a11y.largeTextBody': 'অ্যাপের লেখার আকার ২০% বাড়ান। সিস্টেমের ফন্ট স্কেলিং চালু থাকবে।',
  'a11y.reducedMotion': 'কম অ্যানিমেশন',
  'a11y.reducedMotionBody': 'প্রয়োজন নেই এমন অ্যানিমেশন বন্ধ করুন।',
  'a11y.haptics': 'কম্পন',
  'a11y.hapticsBody': 'ট্যাপ ও সতর্কতায় কম্পন প্রতিক্রিয়া।',
  'a11y.phase8': 'পরবর্তী অ্যাক্সেসিবিলিটি পরীক্ষা',
  'a11y.vo': '• ডিভাইসে VoiceOver / TalkBack পর্যালোচনা',
  'a11y.dt': '• সর্বোচ্চ সিস্টেম লেখা-আকারে বিন্যাস যাচাই',
  'a11y.contrast': '• মানচিত্র ও চার্টে কনট্রাস্ট ও মোটা লেখা পরীক্ষা',
  'a11y.mapA11y': '• মানচিত্রের বিকল্প পাঠ্য ও মানচিত্র-বিহীন পথ',
  'a11y.bn': '• বাংলা (বাংলা) ভাষার পর্যালোচনা',

  // More / Articles
  'more.more': 'আরও',
  'more.openHint': 'নির্বাচিত স্ক্রিন বা পরিষেবা খুলবে',
  'more.submit': 'মাঠপর্যায়ের রিপোর্ট জমা দিন',
  'more.submitSub': 'ছবি + বিবরণ + অবস্থান; অফলাইনে সংরক্ষিত থাকে',
  'more.advisories': 'পরামর্শ',
  'more.advisoriesSub': 'খাতভিত্তিক নির্দেশনা, ধাপ ও যোগাযোগ',
  'more.dataStatus': 'ডেটার অবস্থা',
  'more.dataStatusSub': 'ক্যাশের বয়স ও উৎসের প্রাপ্যতা',
  'more.notifications': 'বিজ্ঞপ্তির সেটিংস',
  'more.notificationsSub': 'জরুরি সতর্কতা, নীরব সময় ও চ্যানেল',
  'more.accessibility': 'অ্যাক্সেসিবিলিটি',
  'more.accessibilitySub': 'থিম, বড় লেখা, কম অ্যানিমেশন ও কম্পন',
  'more.emergency': 'জরুরি সেবায় যোগাযোগ',
  'more.website': 'ব্রাউজারে hazardnet.live খুলুন',
  'more.version': 'HazardNet Mobile v2.2.0 · অফলাইন-প্রথম · ডিভাইসেই গোপনীয়তা',
  'article.methodology': 'পদ্ধতি',
  'article.about': 'HazardNet সম্পর্কে',
  'article.privacy': 'গোপনীয়তা',
  'article.contact': 'যোগাযোগ',

  // Emergency
  'cta.emergency': 'জরুরি সেবায় কল করুন',
  'severity.severe': 'মারাত্মক',
  'severity.warning': 'সতর্কতা',
  'severity.watch': 'নজরদারি',
  'severity.allClear': 'সব ঠিক',
} as const;
