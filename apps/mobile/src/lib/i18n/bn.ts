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
  'map.recenterDenied': 'অবস্থানের অনুমতি নেই — সেটিংস খুলুন',
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

  // More / Articles
  'more.more': 'আরও',
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
