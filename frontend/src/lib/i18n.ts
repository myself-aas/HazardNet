/**
 * Bengali/English internationalisation (Phase 5).
 *
 * Deliberately dependency-free. The site is a public-good hazard dashboard used on
 * low-end Android devices over 2G/3G; pulling in `i18next` + `react-intl` to render
 * a few hundred strings would cost more than the feature is worth, and the whole
 * surface here is a lookup table plus a document-language effect.
 *
 * Three rules this module enforces, because getting them wrong is how bilingual
 * hazard UIs mislead people:
 *
 *   1. **The document language is set, and it is set with the language.** Screen
 *      readers pick a voice from `<html lang>`; a Bengali string marked `lang="en"`
 *      is read aloud as nonsense. `useLanguage` writes `document.documentElement.lang`
 *      and `dir` on every change.
 *   2. **A missing translation degrades to English, never to the key.** A key like
 *      `alerts.level.SEVERE` reaching a user's screen is worse than English text:
 *      it looks like a fault. `translate()` falls back en → key, and the test suite
 *      asserts the dictionaries have no missing keys at all.
 *   3. **Numbers and dates follow the language.** Bengali uses its own digits
 *      (০১২৩৪৫৬৭৮৯) in everyday prose, and a format like `9/18/2026` is
 *      ambiguous in both languages — dates are rendered as `18 September 2026` /
 *      `১৮ সেপ্টেম্বর ২০২৬`.
 *
 * Scope note: Phase 5 translates the alert and map surfaces and the shared chrome
 * they sit in. The long-form content pages (`site-routes.json` sections, blog
 * articles) remain English-only; that is recorded in the Phase 5 report rather than
 * half-done here.
 */

export type Language = 'en' | 'bn';

export const LANGUAGES: Language[] = ['en', 'bn'];

export const DEFAULT_LANGUAGE: Language = 'en';

export const LANGUAGE_STORAGE_KEY = 'hazardnet-language';

/** BCP-47 tag for `<html lang>` and `Intl` formatting. */
export const languageTag = (language: Language): string => (language === 'bn' ? 'bn-BD' : 'en');

export const isLanguage = (value: unknown): value is Language => value === 'en' || value === 'bn';

const EN = {
  'common.language': 'Language',
  'common.english': 'English',
  'common.bengali': 'বাংলা',
  'common.loading': 'Loading…',
  'common.retry': 'Try again',
  'common.close': 'Close',
  'common.print': 'Print',
  'common.download': 'Download',
  'common.updated': 'Updated',
  'common.dataCutoff': 'Data cutoff',
  'common.predictionDate': 'Forecast issued',
  'common.targetDate': 'Valid for',
  'common.leadTime': 'Lead time',
  'common.days': 'days',
  'common.disclaimer': 'Disclaimer',
  'common.none': 'None',
  'common.all': 'All',
  'common.viewAll': 'View all',
  'common.back': 'Back',

  'nav.alerts': 'Alerts',
  'nav.map': 'Map',
  'nav.methodology': 'Methodology',

  'alerts.title': 'Hazard alerts',
  'alerts.standfirst':
    'Alerts issued by the HazardNet pipeline for the districts it has a forecast for. ' +
    'Nothing above a watch is published without a named duty officer approving it.',
  'alerts.level.NO_ALERT': 'No alert',
  'alerts.level.WATCH': 'Watch',
  'alerts.level.WARNING': 'Warning',
  'alerts.level.SEVERE': 'Severe',
  'alerts.level.NO_ALERT.desc': 'Nothing unusual for the season.',
  'alerts.level.WATCH.desc': 'Monitor: conditions are favourable for a hazard.',
  'alerts.level.WARNING.desc': 'Prepare: a damaging event is plausible.',
  'alerts.level.SEVERE.desc': 'Act: an event is imminent or likely.',
  'alerts.empty.title': 'No alerts are published right now',
  'alerts.empty.body':
    'Every district HazardNet can forecast is currently below the watch threshold. This is a ' +
    'quiet period, not a coverage gap — the number of districts assessed is shown above.',
  'alerts.empty.unavailable':
    'Alert data could not be loaded, from either the live API or the offline snapshot. ' +
    'The map and the district pages still carry the last forecast the device has.',
  'alerts.empty.blocked':
    '{assessed} district rows were assessed in this run and none could be published: §1.6 ' +
    'requires a model version on every published alert, and this run does not carry one. The ' +
    'assessments are held, not hidden — they become publishable as soon as the pipeline stamps ' +
    'their provenance.',
  'alerts.count.one': '{count} published alert',
  'alerts.count.other': '{count} published alerts',
  'alerts.count.assessed': '{count} district forecasts assessed',
  'alerts.filter.level': 'Alert level',
  'alerts.filter.hazard': 'Hazard',
  'alerts.filter.division': 'Division',
  'alerts.filter.search': 'Search district',
  'alerts.filter.clear': 'Clear filters',
  'alerts.filter.results': 'Showing {shown} of {total}',
  'alerts.card.hazard': 'Hazard',
  'alerts.card.district': 'District',
  'alerts.card.horizon': 'Horizon',
  'alerts.card.evidence': 'Evidence',
  'alerts.card.confidence': 'Confidence',
  'alerts.card.reviewedBy': 'Reviewed by',
  'alerts.card.autoPublished': 'Published automatically',
  'alerts.card.evidenceCard': 'Evidence card',
  'alerts.card.requiresReview': 'Awaiting duty-officer review',
  'alerts.confidence.uncalibrated':
    'Model score {score} — a relative priority signal, not a probability of the hazard occurring ' +
    '(no calibration map is fitted yet).',
  'alerts.confidence.calibrated': 'Calibrated probability {score}.',
  'alerts.evidence.modelSeverity': 'Model severity',
  'alerts.evidence.physicsSeverity': 'Independent physics severity',
  'alerts.evidence.divergence': 'Track divergence',
  'alerts.evidence.noPhysics': 'No independent physics score on this row',
  'alerts.policy.title': 'How these levels are decided',
  'alerts.policy.ceiling':
    'The pipeline publishes at or below {ceiling} automatically. Anything higher waits for a ' + 'named duty officer.',
  'alerts.policy.calibration':
    'Warnings require a calibrated probability. No calibration map is fitted yet, so a warning ' +
    'cannot currently be issued from model evidence — a watch is the highest automatic level.',
  'alerts.policy.thresholds': 'Thresholds in force',
  'alerts.policy.divergence': 'divergence above {value}',
  'alerts.policy.readFull': 'Read the full alert policy',
  'alerts.detail.title': 'Evidence card',
  'alerts.detail.audit': 'Review record',
  'alerts.detail.notFound': 'That alert could not be found. It may have been superseded by a newer forecast.',
  'alerts.detail.downloadPdf': 'Download as PDF',
  'alerts.detail.downloadCsv': 'Download all alerts (CSV)',

  'source.live': 'Live API',
  'source.snapshot': 'Offline snapshot',
  'source.cache': 'Offline copy',
  'source.cacheNote':
    'This device cached the alert payload it last downloaded while online ({when}). It may be ' +
    'older than the live service — reconnect to refresh.',
  'source.none': 'Unavailable',
  'source.snapshotNote': 'Showing the snapshot committed with this deployment, generated {when}.',
  'source.staleNote': 'This data is {hours} hours old.',
  'source.offlineNote': 'You are offline. Showing the last data this device downloaded.',

  'bandwidth.title': 'Low-bandwidth mode',
  'bandwidth.on': 'Low-bandwidth mode is on: satellite tiles and animations are skipped.',
  'bandwidth.toggle': 'Low-bandwidth mode',
  'bandwidth.toggleHint': 'Use the vector map and skip animations and satellite imagery.',

  'map.title': 'District map',
  'map.listAlternative': 'District list (text alternative for the map)',
  'map.listAlternativeHint':
    'The same districts and levels as the map, as a table you can read with a screen reader or on a slow connection.',
  'map.column.district': 'District',
  'map.column.division': 'Division',
  'map.column.level': 'Level',
  'map.column.hazard': 'Hazard',

  'coverage.summary': '{covered} of {total} districts have a live forecast from this run.',
  'coverage.baselineBadge': 'Baseline',
  'coverage.baselineNote':
    'Districts marked {badge} have no row in this run, so the map shows their static baseline ' +
    'rather than today’s forecast.',
  'coverage.none': 'This run produced rows for every district it requested.',
  'coverage.partialTitle': 'Partial run',
  'coverage.lineagePartial':
    'Some rows in this snapshot cannot name the satellite scenes behind them (a run from before ' +
    'scene lineage existed). Treat their provenance as incomplete.',

  'alerts.levelLabel': 'Alert level',
  'alerts.confidence.calibratedLong': 'The calibrated probability of this outcome is {score}.',
  'alerts.confidence.uncalibratedLong':
    'Model score {score}. This is a softmax output used as a relative priority signal — it is ' +
    'not a probability that the hazard will occur. No calibration map is fitted for this model ' +
    'version, so only the severity bands and the independent physics track should be used to ' +
    'rank districts.',
  'alerts.page.listTitle': 'Published alerts',
  'alerts.page.mapTitle': 'District map',
  'alerts.page.refresh': 'Refresh',
  'alerts.page.loadedAt': 'Loaded {time}',
  'alerts.page.dropped': '{count} rows in the payload were not in the PUBLISHED state and were ignored.',
  'alerts.page.degraded': 'Notes from reading the payload:',
  'alerts.page.viewCards': 'Cards',
  'alerts.page.viewList': 'Text list',
  'alerts.page.official': 'Confirm with the official source before you act:',
  'alerts.page.csv': 'Download all alerts (CSV)',
  'alerts.page.assessed': '{count} districts assessed in this run',
  'alerts.page.noneAssessed': 'This run did not report how many districts it assessed.',
  'alerts.page.policyNote':
    'Levels, thresholds and the human-review rule come from the policy document below, not from ' + 'this page.',
  'alerts.legend.title': 'Alert level',

  'evidence.alertId': 'Alert id',
  'evidence.alertKey': 'Alert key',
  'evidence.confidence': 'Model score',
  'evidence.modelVersion': 'Model version',
  'evidence.dataCutoff': 'Data cutoff',
  'evidence.agreement': 'Track agreement',
  'evidence.engine': 'Rule engine',
  'evidence.drivers': 'Driver variables',
  'evidence.publicationTrail': 'Publication record',
  'evidence.publishedAt': 'Published',
  'evidence.policyVersion': 'Policy version',
  'evidence.publishMode': 'Publication mode',
  'evidence.generated': 'Generated',
  'evidence.exportPdf': 'Download as PDF',
  'evidence.exporting': 'Building PDF…',
  'evidence.exportFailed':
    'The PDF could not be built in this browser. Use the browser print dialog and choose ' + '"Save as PDF" instead.',

  'map.legend.severity': 'Baseline severity',
  'map.legend.alerts': 'Alert level',
  'map.layer.note':
    'Markers are coloured by published alert level where one exists, and by the static baseline ' +
    'severity elsewhere. A baseline colour is not an alert.',

  'district.alerts': 'Alerts for {district}',
  'district.noAlert': 'No published alert for this district.',
  'district.baselineOnly': 'This district has no row in the current run, so the card above shows the static baseline.',

  /* ── The front door (`/`), added 2026-09-19 with the landing-page redesign ──
     The editorial half of `/` is bilingual too, so the page a Bengali reader lands on
     first is not an English article with Bengali badges pinned to it. Long-form copy
     lives in the route's own `i18n.bn` block in `src/content/site-routes.json`; the
     keys below are the labels and sentences the page renders around that copy.

     One deliberate exception to "same meaning, two languages": `frontdoor.language.other`
     is written *in the language it offers* (English shows বাংলায় পড়ুন, Bengali shows
     "Read in English"), which is how a language switcher has to work — a reader who
     cannot read the current language must still be able to find their own.

     REVIEW STATUS: these Bengali strings and the route's `bn` block were read and approved
     by the project owner on 2026-09-19 (owner Action 6c, closed for this surface). The
     approval is recorded on the route itself — `i18n.bn.review` in `site-routes.json` — so
     the copy and its review status cannot drift apart. New Bengali copy starts as
     `pending-native-speaker` and is not announced until it is read. */
  'frontdoor.language.other': 'বাংলায় পড়ুন',
  'frontdoor.relatedPages': 'Related pages',
  'frontdoor.hero.reviewed': 'reviewed {date}',
  'frontdoor.hero.reviewedUnknown': 'review date unknown',
  'frontdoor.hero.ctaMap': 'Open the live map',
  'frontdoor.hero.ctaMethodology': 'How a forecast is produced',
  'frontdoor.hero.ctaScorecard': 'Read the validation scorecard',
  'frontdoor.hero.authority':
    'HazardNet is decision support, not an official warning service. Weather warnings, cyclone signals and flood bulletins come from the Bangladesh Meteorological Department and the Flood Forecasting and Warning Centre; in an emergency call 999.',
  'frontdoor.hero.authorityMap': 'The live map carries the current outlooks.',
  'frontdoor.hero.pauseMotion': 'Pause motion',
  'frontdoor.hero.resumeMotion': 'Resume motion',
  'frontdoor.toc': 'On this page',
  'frontdoor.tocSection': 'Section',
  'frontdoor.bengaliDraft': 'Bengali draft — awaiting native-speaker review',
  'common.showLess': 'Show less',
  'frontdoor.runVisual.showMore': 'Show {remaining} more notes',

  'frontdoor.strip.label': 'Current publication status',
  'frontdoor.strip.publishedNow': 'Published now',
  'frontdoor.strip.reading': 'Reading the alerts artifact …',
  'frontdoor.strip.unreadable':
    'The alerts artifact could not be read on this load, so no count is shown here — an unread file is never reported as zero.',
  'frontdoor.strip.districts': 'Districts covered',
  'frontdoor.strip.assessed': 'Assessed rows',
  'frontdoor.strip.updated': 'Updated',
  'frontdoor.strip.navLabel': 'Alert and map pages',
  'frontdoor.strip.allAlerts': 'All published alerts',
  'frontdoor.strip.liveMap': 'Live map',
  'frontdoor.strip.districtUnnamed': 'District not named',
  'frontdoor.strip.nonePublished': 'No alert is published at the moment of this read.',
  'frontdoor.strip.withheld':
    'The run assessed {assessed} district forecasts and withheld {withheld} of them from publication — a statement about the publisher, not about the weather.',
  'frontdoor.strip.withheldUnknown':
    'The run reported no assessed or withheld counts, so the reason cannot be stated from this artifact.',
  'frontdoor.strip.whyHeld': 'Why a run may be held',

  'frontdoor.runVisual.eyebrow': 'The last run, from the committed artifacts',
  'frontdoor.runVisual.reading': 'Reading /data/freshness.json …',
  'frontdoor.runVisual.unreadable':
    'The freshness artifact could not be read, so this panel states nothing about ages or coverage. The status page will show the same failure.',
  'frontdoor.runVisual.statusPage': 'status page',
  'frontdoor.runVisual.coverage': 'Districts with a row in the last run',
  'frontdoor.runVisual.coverageStatus': 'coverage status',
  'frontdoor.runVisual.units': 'forecast units produced',
  'frontdoor.runVisual.outcome': 'What it published',
  'frontdoor.runVisual.outcomeUnknown':
    'The alert artifact could not be read, so this panel does not state an outcome.',
  'frontdoor.runVisual.publishedSome':
    '{count} alerts are published from this run; each one carries its evidence, its policy version and its reviewer.',
  'frontdoor.runVisual.publishedNone':
    'No alert is published from this run. {withheld} assessed rows were withheld by the review gate rather than dropped silently.',
  'frontdoor.runVisual.artifacts': 'Artifacts this deployment ships',
  'frontdoor.runVisual.honesty': 'What the run reports against itself',
  'frontdoor.runVisual.moreHonesty': 'This card shows the first three of {total} notes; the rest are on the',
  'frontdoor.runVisual.provenance':
    'Every value on this card is read from /data/freshness.json and /data/alerts-latest.json',

  'frontdoor.covers.h2': 'What this deployment covers',
  'frontdoor.covers.hazards': 'Hazard classes, from cold wave to tropical cyclone',
  'frontdoor.covers.districts': 'Districts addressed on the live map',
  'frontdoor.covers.horizons': 'Forecast horizons, in days, from one deterministic weather window',
  'frontdoor.covers.episodes': 'Historical episodes scored in the hindcast report',
  'frontdoor.covers.coverageValue': '{covered} of {expected} districts',
  'frontdoor.covers.noteLead':
    'Coverage is stated from the artifacts, not from the design: the last forecast snapshot covered',
  'frontdoor.covers.noteUnits': '({units} forecast units produced)',
  'frontdoor.covers.noteTail': 'shows where each artifact came from and how old it is.',
  'frontdoor.covers.statusLink': 'status page',

  'frontdoor.run.h2': 'The last published alerts',
  'frontdoor.run.aside': 'read from the committed artifacts on every load',
  'frontdoor.run.publishedEyebrow': 'Published alerts',
  'frontdoor.run.reading': 'Reading the alerts artifact …',
  'frontdoor.run.noneLead': 'That is a statement about the publisher, not about the weather. The run behind this read',
  'frontdoor.run.noneTitle': 'No alert is published at the moment of this read.',
  'frontdoor.run.noneAssessed': 'assessed {assessed} district forecasts',
  'frontdoor.run.noneAssessedUnknown': 'assessed an unreported number of forecasts',
  'frontdoor.run.noneHeld': 'and held {held} of them out of publication',
  'frontdoor.run.nonePublishedNone': 'and published none',
  'frontdoor.run.noneDropped': ', dropping {dropped}',
  'frontdoor.run.noneGenerated': '; it was generated {at}.',
  'frontdoor.run.noneSilence':
    'Silence on an agricultural platform is easily misread as safety, so the distinction matters:',
  'frontdoor.run.distinction': 'no published alert is not the same as no hazard',
  'frontdoor.run.noneRead': 'Read the',
  'frontdoor.run.noneLiveLink': 'live map',
  'frontdoor.run.noneFor': 'for the current outlooks and the',
  'frontdoor.run.noneStatusLink': 'status page',
  'frontdoor.run.noneTail': 'for why a run may be held.',
  'frontdoor.run.errorPrefix': 'The alert source reported: {error}',
  'frontdoor.run.horizon': '{horizon} horizon',
  'frontdoor.run.valid': 'valid {date}',
  'frontdoor.run.published': 'published {at}',
  'frontdoor.run.publishedUnknown': 'publication time not reported',
  'frontdoor.run.alertNav': 'Alert pages',
  'frontdoor.run.failed':
    'At least one artifact could not be read on this load. The panels above say so where it applies; a blank is never rendered as a zero.',

  'frontdoor.faq.h2': 'Direct answers',
  'frontdoor.attribution.eyebrow': 'Attribution',
  'frontdoor.attribution.h2': 'Who built this, and under whose supervision',
  'frontdoor.attribution.body':
    '{author} ({role}) — {work}. {type}, {department}, {university}, supervised by {supervisor} ({supervisorRole}){coSupervision}.',
  'frontdoor.attribution.orcid': 'ORCID {id}',
  // A fragment, not a sentence: the co-supervisor in this repository's attribution data
  // carries a role and a profile URL but no name, so the sentence can only acknowledge one.
  'frontdoor.attribution.coSupervised': ' with a co-supervisor',
  'frontdoor.attribution.citationLabel': 'Cite this work',
  'frontdoor.attribution.links': 'Project links',
  'frontdoor.attribution.repository': 'Repository',
  'frontdoor.attribution.institution': 'Institution',
  'frontdoor.attribution.supervisor': 'Supervisor profile',
  'frontdoor.attribution.coSupervisor': 'Co-supervisor profile',

  'lookup.title': 'District forecast lookup',
  'lookup.standfirst':
    'Read a previously published forecast. Raster uploads and on-demand inference are not supported; selecting a district does not run a model.',
  'lookup.district': 'District',
  'lookup.horizon': 'Horizon',
  'lookup.horizon.7_days': '7 days',
  'lookup.horizon.15_days': '15 days',
  'lookup.submit': 'Load stored forecast',
  'lookup.submitting': 'Loading stored forecast…',
  'lookup.idle.title': 'Choose a district and horizon',
  'lookup.idle.body':
    'Nothing has been requested yet. Select a district and a 7-day or 15-day horizon, then load the stored forecast. This page does not run a model.',
  'lookup.loading': 'Loading stored forecast…',
  'lookup.uncovered.title': 'No stored coverage',
  'lookup.uncovered.body':
    'There is no stored forecast for {district} at the {horizon} horizon. This is a coverage gap, not a zero-risk result.',
  'lookup.error.offline.title': 'You appear to be offline',
  'lookup.error.offline.body':
    'The stored forecast could not be loaded because this device is offline. Retry when a connection is available. A missing result is not an all-clear.',
  'lookup.error.rateLimited.title': 'Too many requests',
  'lookup.error.rateLimited.body':
    'The forecast service asked this page to wait before trying again. Use Try again in a moment.',
  'lookup.error.server.title': 'Stored forecast could not be loaded',
  'lookup.error.server.body':
    'The service did not return a stored forecast. Try again later. This is not a statement about hazard conditions.',
  'lookup.error.invalid.title': 'Stored forecast could not be read',
  'lookup.error.invalid.body':
    'The service returned a response this page could not use. No hazard score is shown rather than guessing.',
  'lookup.ready.title': 'Stored forecast: {hazard}',
  'lookup.source.stored': 'Stored forecast',
  'lookup.freshness.label': 'As of',
  'lookup.freshness.unknown': 'date not recorded',
  'lookup.districtUnknown': 'District not recorded',
  'lookup.target': 'Target',
  'lookup.target.unknown': 'not recorded',
  'lookup.horizonLabel': 'Horizon',
  'lookup.horizon.unknown': 'not recorded',
  'lookup.severity': 'Severity score',
  'lookup.confidence.calibrated': 'Calibrated probability',
  'lookup.confidence.uncalibrated': 'Uncalibrated top-class score (not an event probability)',
  'lookup.modelVersion': 'Model version',
  'lookup.modelVersion.missing': 'Not recorded for this row',
  'lookup.evidence.summary': 'Evidence notes',
  'lookup.evidence.missingDrivers':
    'No inference was run for this request. Per-class probabilities, top-three classes and satellite drivers are not recorded for this row.',
  'lookup.disclaimer': 'Decision support only. Follow official BMD, FFWC and DDM instructions.',

  'a11y.skipToList': 'Skip to the district list',
  'a11y.mapRegion': 'Interactive map of Bangladesh',
} as const;

type DictionaryKey = keyof typeof EN;

/** Every key the UI may ask for. Exported so tests can prove coverage. */
export const TRANSLATION_KEYS = Object.keys(EN) as DictionaryKey[];

const BN: Record<string, string> = {
  'common.language': 'ভাষা',
  'common.english': 'English',
  'common.bengali': 'বাংলা',
  'common.loading': 'লোড হচ্ছে…',
  'common.retry': 'আবার চেষ্টা করুন',
  'common.close': 'বন্ধ করুন',
  'common.print': 'প্রিন্ট',
  'common.download': 'ডাউনলোড',
  'common.updated': 'হালনাগাদ',
  'common.dataCutoff': 'ডেটার সময়সীমা',
  'common.predictionDate': 'পূর্বাভাস প্রকাশ',
  'common.targetDate': 'প্রযোজ্য সময়',
  'common.leadTime': 'সতর্কবার্তার সময়',
  'common.days': 'দিন',
  'common.disclaimer': 'দাবিত্যাগ',
  'common.none': 'নেই',
  'common.all': 'সব',
  'common.viewAll': 'সব দেখুন',
  'common.back': 'ফিরে যান',

  'nav.alerts': 'সতর্কবার্তা',
  'nav.map': 'মানচিত্র',
  'nav.methodology': 'পদ্ধতি',

  'alerts.title': 'ঝুঁকির সতর্কবার্তা',
  'alerts.standfirst':
    'যে জেলাগুলোর পূর্বাভাস HazardNet-এর কাছে আছে, সেগুলোর জন্য প্রকাশিত সতর্কবার্তা। ' +
    'সতর্ক দৃষ্টির উপরে কোনো স্তর কোনো দায়িত্বপ্রাপ্ত কর্মকর্তার অনুমোদন ছাড়া প্রকাশিত হয় না।',
  'alerts.level.NO_ALERT': 'স্বাভাবিক',
  'alerts.level.WATCH': 'সতর্ক দৃষ্টি',
  'alerts.level.WARNING': 'সতর্কতা',
  'alerts.level.SEVERE': 'মারাত্মক সতর্কতা',
  'alerts.level.NO_ALERT.desc': 'এই মৌসুমে অস্বাভাবিক কিছু নেই।',
  'alerts.level.WATCH.desc': 'নজর রাখুন: দুর্যোগের অনুকূল অবস্থা তৈরি হচ্ছে।',
  'alerts.level.WARNING.desc': 'প্রস্তুতি নিন: ক্ষয়ক্ষতির আশঙ্কা রয়েছে।',
  'alerts.level.SEVERE.desc': 'ব্যবস্থা নিন: দুর্যোগ আসন্ন বা সম্ভাব্য।',
  'alerts.empty.title': 'এই মুহূর্তে কোনো সতর্কবার্তা প্রকাশিত নেই',
  'alerts.empty.body':
    'HazardNet যে জেলাগুলোর পূর্বাভাস দিতে পারে, তার সবগুলোই বর্তমানে সতর্ক দৃষ্টির সীমার নিচে। ' +
    'এটি শান্ত সময়, তথ্যের ঘাটতি নয় — উপরে কতটি জেলা মূল্যায়ন করা হয়েছে তা দেখা যাচ্ছে।',
  'alerts.empty.unavailable':
    'লাইভ API বা অফলাইন স্ন্যাপশট — কোনোটিই থেকে সতর্কবার্তার তথ্য আনা যায়নি। ' +
    'মানচিত্র ও জেলার পাতায় যন্ত্রে সংরক্ষিত সর্বশেষ পূর্বাভাস আগের মতোই আছে।',
  'alerts.empty.blocked':
    'এই রানে {assessed}টি জেলার সারি পর্যালোচনা করা হয়েছে, কিন্তু একটিও প্রকাশ করা যায়নি: ' +
    '§1.6 অনুযায়ী প্রতিটি প্রকাশিত সতর্কবার্তায় মডেল সংস্করণ থাকতে হয়, আর এই রানে তা নেই। ' +
    'পর্যালোচনাগুলো আটকে রাখা হয়েছে, লুকানো হয়নি — উৎস নথিভুক্ত হলেই সেগুলো প্রকাশযোগ্য হবে।',
  'alerts.count.one': '{count}টি প্রকাশিত সতর্কবার্তা',
  'alerts.count.other': '{count}টি প্রকাশিত সতর্কবার্তা',
  'alerts.count.assessed': '{count}টি জেলার পূর্বাভাস মূল্যায়ন করা হয়েছে',
  'alerts.filter.level': 'সতর্কবার্তার স্তর',
  'alerts.filter.hazard': 'দুর্যোগ',
  'alerts.filter.division': 'বিভাগ',
  'alerts.filter.search': 'জেলা খুঁজুন',
  'alerts.filter.clear': 'ফিল্টার মুছুন',
  'alerts.filter.results': '{total}টির মধ্যে {shown}টি দেখানো হচ্ছে',
  'alerts.card.hazard': 'দুর্যোগ',
  'alerts.card.district': 'জেলা',
  'alerts.card.horizon': 'সময়সীমা',
  'alerts.card.evidence': 'প্রমাণ',
  'alerts.card.confidence': 'নির্ভরযোগ্যতা',
  'alerts.card.reviewedBy': 'পর্যালোচনা করেছেন',
  'alerts.card.autoPublished': 'স্বয়ংক্রিয়ভাবে প্রকাশিত',
  'alerts.card.evidenceCard': 'প্রমাণপত্র',
  'alerts.card.requiresReview': 'কর্মকর্তার পর্যালোচনার অপেক্ষায়',
  'alerts.confidence.uncalibrated':
    'মডেল স্কোর {score} — এটি আপেক্ষিক অগ্রাধিকার নির্দেশক, দুর্যোগ ঘটার সম্ভাবনা নয় ' +
    '(ক্রমাঙ্কন মানচিত্র এখনো তৈরি হয়নি)।',
  'alerts.confidence.calibrated': 'ক্রমাঙ্কিত সম্ভাবনা {score}।',
  'alerts.evidence.modelSeverity': 'মডেল তীব্রতা',
  'alerts.evidence.physicsSeverity': 'স্বাধীন ভৌত-বিশ্লেষণের তীব্রতা',
  'alerts.evidence.divergence': 'দুই ধারার পার্থক্য',
  'alerts.evidence.noPhysics': 'এই সারিতে স্বাধীন ভৌত-বিশ্লেষণের মান নেই',
  'alerts.policy.title': 'এই স্তরগুলো কীভাবে নির্ধারিত হয়',
  'alerts.policy.ceiling':
    'পাইপলাইন {ceiling} ও তার নিচের স্তর স্বয়ংক্রিয়ভাবে প্রকাশ করে। এর উপরে যেকোনো স্তরের জন্য ' +
    'নামধারী দায়িত্বপ্রাপ্ত কর্মকর্তার অনুমোদন লাগে।',
  'alerts.policy.calibration':
    'সতর্কতার জন্য ক্রমাঙ্কিত সম্ভাবনা দরকার। এখনো কোনো ক্রমাঙ্কন মানচিত্র তৈরি হয়নি, তাই মডেলের ' +
    'প্রমাণ থেকে সতর্কতা দেওয়া যাচ্ছে না — স্বয়ংক্রিয়ভাবে প্রকাশযোগ্য সর্বোচ্চ স্তর সতর্ক দৃষ্টি।',
  'alerts.policy.thresholds': 'বর্তমান সীমা',
  'alerts.policy.divergence': 'পার্থক্য {value}-এর বেশি',
  'alerts.policy.readFull': 'সম্পূর্ণ নীতি পড়ুন',
  'alerts.detail.title': 'প্রমাণপত্র',
  'alerts.detail.audit': 'পর্যালোচনার নথি',
  'alerts.detail.notFound': 'সতর্কবার্তাটি পাওয়া যায়নি। নতুন পূর্বাভাসের কারণে এটি বাতিল হয়ে থাকতে পারে।',
  'alerts.detail.downloadPdf': 'PDF হিসেবে ডাউনলোড',
  'alerts.detail.downloadCsv': 'সব সতর্কবার্তা ডাউনলোড (CSV)',

  'source.live': 'লাইভ API',
  'source.snapshot': 'অফলাইন স্ন্যাপশট',
  'source.cache': 'অফলাইন কপি',
  'source.cacheNote':
    'এই যন্ত্রে সর্বশেষ অনলাইনে নামানো সতর্কবার্তার কপি সংরক্ষিত আছে ({when})। এটি লাইভ সেবার চেয়ে ' +
    'পুরোনো হতে পারে — হালনাগাদের জন্য আবার ইন্টারনেটে যুক্ত হন।',
  'source.none': 'পাওয়া যায়নি',
  'source.snapshotNote': 'এই ডিপ্লয়মেন্টের সঙ্গে সংরক্ষিত স্ন্যাপশট দেখানো হচ্ছে, তৈরি {when}।',
  'source.staleNote': 'এই তথ্য {hours} ঘণ্টা আগের।',
  'source.offlineNote': 'আপনি অফলাইনে আছেন। এই যন্ত্রে সর্বশেষ নামানো তথ্য দেখানো হচ্ছে।',

  'bandwidth.title': 'কম-ব্যান্ডউইথ মোড',
  'bandwidth.on': 'কম-ব্যান্ডউইথ মোড চালু: স্যাটেলাইট টাইল ও অ্যানিমেশন বন্ধ।',
  'bandwidth.toggle': 'কম-ব্যান্ডউইথ মোড',
  'bandwidth.toggleHint': 'ভেক্টর মানচিত্র ব্যবহার করুন, স্যাটেলাইট চিত্র ও অ্যানিমেশন এড়িয়ে যান।',

  'map.title': 'জেলার মানচিত্র',
  'map.listAlternative': 'জেলার তালিকা (মানচিত্রের পাঠ্য বিকল্প)',
  'map.listAlternativeHint':
    'মানচিত্রে যা দেখা যায়, সেই জেলা ও স্তরগুলোর ছক — স্ক্রিন রিডার বা ধীর ইন্টারনেটে পড়ার জন্য।',
  'map.column.district': 'জেলা',
  'map.column.division': 'বিভাগ',
  'map.column.level': 'স্তর',
  'map.column.hazard': 'দুর্যোগ',

  'coverage.summary': 'এই রানে {total}টি জেলার মধ্যে {covered}টির লাইভ পূর্বাভাস আছে।',
  'coverage.baselineBadge': 'ভিত্তিমান',
  'coverage.baselineNote':
    '{badge} চিহ্নিত জেলাগুলোর এই রানে কোনো সারি নেই, তাই মানচিত্রে আজকের পূর্বাভাসের বদলে ' +
    'তাদের স্থির ভিত্তিমান দেখানো হচ্ছে।',
  'coverage.none': 'এই রান যত জেলার জন্য তথ্য চেয়েছিল, সবার সারি তৈরি হয়েছে।',
  'coverage.partialTitle': 'আংশিক রান',
  'coverage.lineagePartial':
    'এই স্ন্যাপশটের কিছু সারির পেছনের স্যাটেলাইট দৃশ্যের নথি নেই (দৃশ্য-নথি চালু হওয়ার আগের রান)। ' +
    'তাদের উৎসকে অসম্পূর্ণ ধরে নিন।',

  'alerts.levelLabel': 'সতর্কতার মাত্রা',
  'alerts.confidence.calibratedLong': 'এই ফলাফলের ক্রমাঙ্কিত সম্ভাবনা {score}।',
  'alerts.confidence.uncalibratedLong':
    'মডেল স্কোর {score}। এটি একটি সফটম্যাক্স মান, যা আপেক্ষিক অগ্রাধিকার বোঝাতে ব্যবহৃত হয় — ' +
    'দুর্যোগ ঘটার সম্ভাবনা নয়। এই মডেল সংস্করণের জন্য কোনো ক্রমাঙ্কন মানচিত্র তৈরি হয়নি, তাই ' +
    'জেলা সাজানোর জন্য কেবল গুরুতরতার স্তর ও স্বতন্ত্র ভৌত-নিয়ম ট্র্যাক ব্যবহার করা উচিত।',
  'alerts.page.listTitle': 'প্রকাশিত সতর্কবার্তা',
  'alerts.page.mapTitle': 'জেলার মানচিত্র',
  'alerts.page.refresh': 'রিফ্রেশ',
  'alerts.page.loadedAt': '{time}-এ লোড হয়েছে',
  'alerts.page.dropped': 'পেলোডের {count}টি সারি PUBLISHED অবস্থায় ছিল না, তাই বাদ দেওয়া হয়েছে।',
  'alerts.page.degraded': 'পেলোড পড়ার সময় পাওয়া মন্তব্য:',
  'alerts.page.viewCards': 'কার্ড',
  'alerts.page.viewList': 'লেখা তালিকা',
  'alerts.page.official': 'ব্যবস্থা নেওয়ার আগে সরকারি সূত্রে যাচাই করুন:',
  'alerts.page.csv': 'সব সতর্কবার্তা ডাউনলোড (CSV)',
  'alerts.page.assessed': 'এই রানে {count}টি জেলা পর্যালোচনা করা হয়েছে',
  'alerts.page.noneAssessed': 'এই রান কতটি জেলা পর্যালোচনা করেছে তা জানায়নি।',
  'alerts.page.policyNote': 'স্তর, থ্রেশহোল্ড ও মানব-পর্যালোচনার নিয়ম এই পাতার নয়, নিচের নীতি-দলিল থেকে আসে।',
  'alerts.legend.title': 'সতর্কতার মাত্রা',

  'evidence.alertId': 'সতর্কবার্তার আইডি',
  'evidence.alertKey': 'সতর্কবার্তার কী',
  'evidence.confidence': 'মডেল স্কোর',
  'evidence.modelVersion': 'মডেল সংস্করণ',
  'evidence.dataCutoff': 'তথ্যের সময়সীমা',
  'evidence.agreement': 'ট্র্যাকের সমতা',
  'evidence.engine': 'নিয়ম ইঞ্জিন',
  'evidence.drivers': 'প্রধান চালক',
  'evidence.publicationTrail': 'প্রকাশের রেকর্ড',
  'evidence.publishedAt': 'প্রকাশিত',
  'evidence.policyVersion': 'নীতির সংস্করণ',
  'evidence.publishMode': 'প্রকাশের ধরন',
  'evidence.generated': 'তৈরি',
  'evidence.exportPdf': 'PDF হিসেবে ডাউনলোড',
  'evidence.exporting': 'PDF তৈরি হচ্ছে…',
  'evidence.exportFailed': 'এই ব্রাউজারে PDF তৈরি করা যায়নি। ব্রাউজারের প্রিন্ট থেকে "Save as PDF" বেছে নিন।',

  'map.legend.severity': 'ভিত্তিমান গুরুতরতা',
  'map.legend.alerts': 'সতর্কতার মাত্রা',
  'map.layer.note':
    'যেখানে প্রকাশিত সতর্কবার্তা আছে সেখানে রং সেই স্তর অনুযায়ী, বাকি জেলায় স্থির ভিত্তিমান ' +
    'অনুযায়ী। ভিত্তিমানের রং কোনো সতর্কবার্তা নয়।',

  'district.alerts': '{district}-এর সতর্কবার্তা',
  'district.noAlert': 'এই জেলার জন্য কোনো প্রকাশিত সতর্কবার্তা নেই।',
  'district.baselineOnly': 'বর্তমান রানে এই জেলার কোনো সারি নেই, তাই উপরের কার্ডে স্থির ভিত্তিমান দেখানো হচ্ছে।',

  /* ── The front door (`/`) — see the note on the English side: drafted, awaiting the
     native-speaker review recorded as owner Action 6c. ── */
  'frontdoor.language.other': 'Read in English',
  'frontdoor.relatedPages': 'সংশ্লিষ্ট পাতা',
  'frontdoor.hero.reviewed': 'পর্যালোচনা {date}',
  'frontdoor.hero.reviewedUnknown': 'পর্যালোচনার তারিখ অজানা',
  'frontdoor.hero.ctaMap': 'লাইভ মানচিত্র খুলুন',
  'frontdoor.hero.ctaMethodology': 'কীভাবে পূর্বাভাস তৈরি হয়',
  'frontdoor.hero.ctaScorecard': 'যাচাই স্কোরকার্ড পড়ুন',
  'frontdoor.hero.authority':
    'HazardNet সিদ্ধান্ত সহায়তা মাত্র, কোনো সরকারি সতর্কবার্তা সেবা নয়। আবহাওয়ার সতর্কবার্তা, ঘূর্ণিঝড় সংকেত ও বন্যা বুলেটিন প্রকাশ করে বাংলাদেশ আবহাওয়া অধিদপ্তর এবং প্লাবন পূর্বাভাস ও সতর্কীকরণ কেন্দ্র (FFWC); জরুরি অবস্থায় ৯৯৯ নম্বরে কল করুন।',
  'frontdoor.hero.authorityMap': 'বর্তমান পূর্বাভাস লাইভ মানচিত্রে দেখা যাবে।',
  'frontdoor.hero.pauseMotion': 'গতি থামান',
  'frontdoor.hero.resumeMotion': 'গতি চালু করুন',
  'frontdoor.toc': 'এই পাতায়',
  'frontdoor.tocSection': 'বিভাগ',
  'frontdoor.bengaliDraft': 'বাংলা খসড়া — স্থানীয় ভাষাভাষীর পর্যালোচনা বাকি',
  'common.showLess': 'কম দেখান',
  'frontdoor.runVisual.showMore': 'আরও {remaining}টি নোট দেখান',

  'frontdoor.strip.label': 'প্রকাশনার বর্তমান অবস্থা',
  'frontdoor.strip.publishedNow': 'এই মুহূর্তে প্রকাশিত',
  'frontdoor.strip.reading': 'সতর্কবার্তার আর্টিফ্যাক্ট পড়া হচ্ছে…',
  'frontdoor.strip.unreadable':
    'এইবার আর্টিফ্যাক্টটি পড়া যায়নি, তাই এখানে কোনো সংখ্যা দেখানো হচ্ছে না — ফাইল পড়া না গেলে তা শূন্য হিসেবে দেখানো হয় না।',
  'frontdoor.strip.districts': 'আওতাভুক্ত জেলা',
  'frontdoor.strip.assessed': 'মূল্যায়িত সারি',
  'frontdoor.strip.updated': 'হালনাগাদ',
  'frontdoor.strip.navLabel': 'সতর্কবার্তা ও মানচিত্রের পাতা',
  'frontdoor.strip.allAlerts': 'প্রকাশিত সব সতর্কবার্তা',
  'frontdoor.strip.liveMap': 'লাইভ মানচিত্র',
  'frontdoor.strip.districtUnnamed': 'জেলার নাম দেওয়া নেই',
  'frontdoor.strip.nonePublished': 'এই মুহূর্তে কোনো সতর্কবার্তা প্রকাশিত নেই।',
  'frontdoor.strip.withheld':
    'এই রানে {assessed}টি জেলা-পূর্বাভাস মূল্যায়ন করা হয়েছে এবং {withheld}টি প্রকাশ থেকে বিরত রাখা হয়েছে — এটি প্রকাশকের অবস্থা, আবহাওয়ার নয়।',
  'frontdoor.strip.withheldUnknown':
    'এই রানে মূল্যায়ন বা বিরত রাখার সংখ্যা জানানো হয়নি, তাই এই আর্টিফ্যাক্ট থেকে কারণ বলা যাচ্ছে না।',
  'frontdoor.strip.whyHeld': 'কেন একটি রান আটকে থাকতে পারে',

  'frontdoor.runVisual.eyebrow': 'সংরক্ষিত আর্টিফ্যাক্ট অনুযায়ী শেষ রান',
  'frontdoor.runVisual.reading': '/data/freshness.json পড়া হচ্ছে…',
  'frontdoor.runVisual.unreadable':
    'ফ্রেশনেস আর্টিফ্যাক্ট পড়া যায়নি, তাই এই প্যানেলে বয়স বা আচ্ছাদন সম্পর্কে কিছু বলা হচ্ছে না। স্ট্যাটাস পাতায় একই ব্যর্থতা দেখা যাবে।',
  'frontdoor.runVisual.statusPage': 'স্ট্যাটাস পাতা',
  'frontdoor.runVisual.coverage': 'শেষ রানে যেসব জেলার তথ্যসারি আছে',
  'frontdoor.runVisual.coverageStatus': 'আচ্ছাদনের অবস্থা',
  'frontdoor.runVisual.units': 'পূর্বাভাস ইউনিট তৈরি হয়েছে',
  'frontdoor.runVisual.outcome': 'এই রানে যা প্রকাশিত হয়েছে',
  'frontdoor.runVisual.outcomeUnknown':
    'সতর্কবার্তার আর্টিফ্যাক্ট পড়া যায়নি, তাই এই প্যানেল ফলাফল সম্পর্কে কিছু বলছে না।',
  'frontdoor.runVisual.publishedSome':
    'এই রান থেকে {count}টি সতর্কবার্তা প্রকাশিত; প্রতিটির সঙ্গে তার প্রমাণ, নীতির সংস্করণ ও পর্যালোচনাকারীর পরিচয় আছে।',
  'frontdoor.runVisual.publishedNone':
    'এই রান থেকে কোনো সতর্কবার্তা প্রকাশিত হয়নি। মূল্যায়িত {withheld}টি সারি নীরবে বাদ না দিয়ে পর্যালোচনা-গেটে আটকে রাখা হয়েছে।',
  'frontdoor.runVisual.artifacts': 'এই ডিপ্লয়মেন্ট যেসব আর্টিফ্যাক্ট সরবরাহ করে',
  'frontdoor.runVisual.honesty': 'রান নিজেই যেসব সীমাবদ্ধতা জানিয়েছে',
  'frontdoor.runVisual.moreHonesty': 'এই কার্ডে {total}টি নোটের প্রথম তিনটি দেখানো হলো; বাকিগুলো আছে',
  'frontdoor.runVisual.provenance':
    'এই কার্ডের প্রতিটি সংখ্যা /data/freshness.json ও /data/alerts-latest.json থেকে নেওয়া',

  'frontdoor.covers.h2': 'এই ডিপ্লয়মেন্ট যা আওতা করে',
  'frontdoor.covers.hazards': 'দুর্যোগের শ্রেণি, শৈতপ্রবাহ থেকে ঘূর্ণিঝড় পর্যন্ত',
  'frontdoor.covers.districts': 'লাইভ মানচিত্রে আওতাভুক্ত জেলা',
  'frontdoor.covers.horizons': 'একটি নির্ধারিত আবহাওয়া উইন্ডো থেকে পূর্বাভাসের সময়কাল (দিনে)',
  'frontdoor.covers.episodes': 'হিন্ডকাস্ট প্রতিবেদনে মূল্যায়িত ঐতিহাসিক ঘটনা',
  'frontdoor.covers.coverageValue': '{expected}টির মধ্যে {covered}টি জেলা',
  'frontdoor.covers.noteLead':
    'আচ্ছাদন নকশা থেকে নয়, আর্টিফ্যাক্ট থেকে বলা হয়েছে: শেষ পূর্বাভাস স্ন্যাপশট আওতা করেছে',
  'frontdoor.covers.noteUnits': '({units}টি পূর্বাভাস ইউনিট তৈরি)',
  'frontdoor.covers.noteTail': 'দেখায় প্রতিটি আর্টিফ্যাক্ট কোথা থেকে এসেছে এবং কত পুরনো।',
  'frontdoor.covers.statusLink': 'স্ট্যাটাস পাতা',

  'frontdoor.run.h2': 'সর্বশেষ প্রকাশিত সতর্কবার্তা',
  'frontdoor.run.aside': 'প্রতিবার লোড করলে সংরক্ষিত আর্টিফ্যাক্ট থেকে পড়া হয়',
  'frontdoor.run.publishedEyebrow': 'প্রকাশিত সতর্কবার্তা',
  'frontdoor.run.reading': 'সতর্কবার্তার আর্টিফ্যাক্ট পড়া হচ্ছে…',
  'frontdoor.run.noneLead': 'এটি প্রকাশক সম্পর্কে একটি বিবৃতি, আবহাওয়া সম্পর্কে নয়। এই পাঠের পেছনের রান',
  'frontdoor.run.noneTitle': 'এই মুহূর্তে কোনো সতর্কবার্তা প্রকাশিত নেই।',
  'frontdoor.run.noneAssessed': '{assessed}টি জেলা-পূর্বাভাস মূল্যায়ন করেছে',
  'frontdoor.run.noneAssessedUnknown': 'অজানা সংখ্যক পূর্বাভাস মূল্যায়ন করেছে',
  'frontdoor.run.noneHeld': 'এবং {held}টি প্রকাশ থেকে বিরত রেখেছে',
  'frontdoor.run.nonePublishedNone': 'এবং কোনোটিই প্রকাশ করেনি',
  'frontdoor.run.noneDropped': ', বাদ দিয়েছে {dropped}টি',
  'frontdoor.run.noneGenerated': '; এটি তৈরি হয়েছে {at}।',
  'frontdoor.run.noneSilence':
    'কৃষিবিষয়ক প্ল্যাটফর্মে নীরবতা সহজেই নিরাপত্তা বলে ভুল বোঝা যায়, তাই এই পার্থক্য গুরুত্বপূর্ণ:',
  'frontdoor.run.distinction': 'প্রকাশিত সতর্কবার্তা নেই মানে এই নয় যে দুর্যোগ নেই',
  'frontdoor.run.noneRead': 'বর্তমান পূর্বাভাসের জন্য দেখুন',
  'frontdoor.run.noneLiveLink': 'লাইভ মানচিত্র',
  'frontdoor.run.noneFor': 'এবং একটি রান কেন আটকে থাকতে পারে তা জানতে',
  'frontdoor.run.noneStatusLink': 'স্ট্যাটাস পাতা',
  'frontdoor.run.noneTail': 'দেখুন।',
  'frontdoor.run.errorPrefix': 'সতর্কবার্তার উৎস জানিয়েছে: {error}',
  'frontdoor.run.horizon': '{horizon} সময়কাল',
  'frontdoor.run.valid': 'প্রযোজ্য {date}',
  'frontdoor.run.published': 'প্রকাশিত {at}',
  'frontdoor.run.publishedUnknown': 'প্রকাশের সময় জানানো হয়নি',
  'frontdoor.run.alertNav': 'সতর্কবার্তার পাতা',
  'frontdoor.run.failed':
    'এইবার অন্তত একটি আর্টিফ্যাক্ট পড়া যায়নি। যেখানে প্রযোজ্য, ওপরের প্যানেলগুলো তা জানিয়েছে; খালি ঘর কখনো শূন্য হিসেবে দেখানো হয় না।',

  'frontdoor.faq.h2': 'সরাসরি উত্তর',
  'frontdoor.attribution.eyebrow': 'স্বীকৃতি',
  'frontdoor.attribution.h2': 'কে তৈরি করেছেন এবং কার তত্ত্বাবধানে',
  'frontdoor.attribution.body':
    '{author} ({role}) — {work}. {type}, {department}, {university}; তত্ত্বাবধানে {supervisor} ({supervisorRole}){coSupervision}।',
  'frontdoor.attribution.orcid': 'ওআরসিআইডি {id}',
  'frontdoor.attribution.coSupervised': ', সহ-তত্ত্বাবধায়কসহ',
  'frontdoor.attribution.citationLabel': 'উদ্ধৃতি',
  'frontdoor.attribution.links': 'প্রকল্পের লিংক',
  'frontdoor.attribution.repository': 'রিপোজিটরি',
  'frontdoor.attribution.institution': 'প্রতিষ্ঠান',
  'frontdoor.attribution.supervisor': 'তত্ত্বাবধায়কের প্রোফাইল',
  'frontdoor.attribution.coSupervisor': 'সহ-তত্ত্বাবধায়কের প্রোফাইল',

  'lookup.title': 'জেলার পূর্বাভাস খুঁজুন',
  'lookup.standfirst':
    'আগে প্রকাশিত একটি পূর্বাভাস পড়ুন। রাস্টার আপলোড বা চাহিদামতো ইনফারেন্স এখানে নেই; জেলা বেছে নিলে মডেল চলে না।',
  'lookup.district': 'জেলা',
  'lookup.horizon': 'সময়সীমা',
  'lookup.horizon.7_days': '৭ দিন',
  'lookup.horizon.15_days': '১৫ দিন',
  'lookup.submit': 'সংরক্ষিত পূর্বাভাস লোড করুন',
  'lookup.submitting': 'সংরক্ষিত পূর্বাভাস লোড হচ্ছে…',
  'lookup.idle.title': 'একটি জেলা ও সময়সীমা বেছে নিন',
  'lookup.idle.body':
    'এখনো কোনো অনুরোধ করা হয়নি। একটি জেলা এবং ৭ দিন বা ১৫ দিনের সময়সীমা বেছে নিয়ে সংরক্ষিত পূর্বাভাস লোড করুন। এই পাতা কোনো মডেল চালায় না।',
  'lookup.loading': 'সংরক্ষিত পূর্বাভাস লোড হচ্ছে…',
  'lookup.uncovered.title': 'সংরক্ষিত আওতা নেই',
  'lookup.uncovered.body':
    '{district} জেলার {horizon} সময়সীমায় কোনো সংরক্ষিত পূর্বাভাস নেই। এটি আওতার ঘাটতি, শূন্য-ঝুঁকির ফল নয়।',
  'lookup.error.offline.title': 'আপনি অফলাইনে আছেন বলে মনে হচ্ছে',
  'lookup.error.offline.body':
    'এই যন্ত্র অফলাইন থাকায় সংরক্ষিত পূর্বাভাস লোড করা যায়নি। সংযোগ ফিরলে আবার চেষ্টা করুন। ফল না আসা মানে নিরাপদ নয়।',
  'lookup.error.rateLimited.title': 'অনুরোধের সংখ্যা বেশি',
  'lookup.error.rateLimited.body':
    'সেবা এই পাতাকে একটু অপেক্ষা করতে বলেছে। কিছুক্ষণ পর আবার চেষ্টা করুন।',
  'lookup.error.server.title': 'সংরক্ষিত পূর্বাভাস লোড করা যায়নি',
  'lookup.error.server.body':
    'সেবা কোনো সংরক্ষিত পূর্বাভাস ফেরত দেয়নি। পরে আবার চেষ্টা করুন। এটি আবহাওয়ার অবস্থা সম্পর্কে কোনো বিবৃতি নয়।',
  'lookup.error.invalid.title': 'সংরক্ষিত পূর্বাভাস পড়া যায়নি',
  'lookup.error.invalid.body':
    'সেবার উত্তর এই পাতা ব্যবহার করতে পারেনি। অনুমান করে কোনো স্কোর দেখানো হয়নি।',
  'lookup.ready.title': 'সংরক্ষিত পূর্বাভাস: {hazard}',
  'lookup.source.stored': 'সংরক্ষিত পূর্বাভাস',
  'lookup.freshness.label': 'তারিখ',
  'lookup.freshness.unknown': 'তারিখ নথিভুক্ত নেই',
  'lookup.districtUnknown': 'জেলার নাম নথিভুক্ত নেই',
  'lookup.target': 'প্রযোজ্য',
  'lookup.target.unknown': 'নথিভুক্ত নেই',
  'lookup.horizonLabel': 'সময়সীমা',
  'lookup.horizon.unknown': 'নথিভুক্ত নেই',
  'lookup.severity': 'তীব্রতার স্কোর',
  'lookup.confidence.calibrated': 'ক্রমাঙ্কিত সম্ভাবনা',
  'lookup.confidence.uncalibrated': 'অক্রমাঙ্কিত শীর্ষ-শ্রেণির স্কোর (ঘটনার সম্ভাবনা নয়)',
  'lookup.modelVersion': 'মডেল সংস্করণ',
  'lookup.modelVersion.missing': 'এই সারিতে নথিভুক্ত নেই',
  'lookup.evidence.summary': 'প্রমাণের নোট',
  'lookup.evidence.missingDrivers':
    'এই অনুরোধে কোনো ইনফারেন্স চালানো হয়নি। শ্রেণিভিত্তিক সম্ভাবনা, শীর্ষ তিন শ্রেণি ও উপগ্রহ চালক এই সারিতে নথিভুক্ত নেই।',
  'lookup.disclaimer':
    'কেবল সিদ্ধান্ত সহায়তা। সরকারি নির্দেশনার জন্য বিএমডি, এফএফডব্লিউসি ও ডিডিএম অনুসরণ করুন।',

  'a11y.skipToList': 'জেলার তালিকায় যান',
  'a11y.mapRegion': 'বাংলাদেশের ইন্টারঅ্যাকটিভ মানচিত্র',
};

export const DICTIONARIES: Record<Language, Record<string, string>> = { en: EN, bn: BN };

/**
 * Choose the language for a first visit.
 *
 * Order: an explicit stored choice → the browser's own preference (Bengali is the
 * language of most of the intended audience, so `navigator.languages` is honoured
 * rather than ignored) → English. Pure, so the decision is testable.
 */
export function resolveInitialLanguage(
  options: {
    stored?: string | null;
    navigatorLanguages?: readonly string[] | null;
    fallback?: Language;
  } = {},
): Language {
  const { stored, navigatorLanguages, fallback = DEFAULT_LANGUAGE } = options;
  if (isLanguage(stored)) return stored;
  for (const tag of navigatorLanguages || []) {
    const base = String(tag).toLowerCase().split('-')[0];
    if (base === 'bn') return 'bn';
    if (base === 'en') return 'en';
  }
  return fallback;
}

/**
 * Translate a key. Never throws and never returns a raw key when a translation
 * exists in either language.
 */
export function translate(language: Language, key: string, vars?: Record<string, string | number>): string {
  const dictionary = DICTIONARIES[language] || DICTIONARIES[DEFAULT_LANGUAGE];
  let value = dictionary[key];
  if (value === undefined) value = DICTIONARIES[DEFAULT_LANGUAGE][key];
  if (value === undefined) return key;
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

/** Western digits → Bengali digits (০–৯). */
export function toBengaliNumerals(value: string | number): string {
  return String(value).replace(/[0-9]/g, (digit) => BN_DIGITS[Number(digit)]);
}

/**
 * Locale-aware number rendering. Bengali gets its own digits, because a Bangladeshi
 * farmer reading `0.94` in a Bengali sentence is a small but real friction point.
 */
export function formatNumber(
  value: number | null | undefined,
  language: Language,
  options: Intl.NumberFormatOptions = { maximumFractionDigits: 2 },
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  let rendered: string;
  try {
    rendered = new Intl.NumberFormat(language === 'bn' ? 'bn-BD' : 'en-GB', options).format(value);
  } catch {
    rendered = String(value);
  }
  return language === 'bn' && !/[০-৯]/.test(rendered) ? toBengaliNumerals(rendered) : rendered;
}

const EN_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const BN_MONTHS = [
  'জানুয়ারি',
  'ফেব্রুয়ারি',
  'মার্চ',
  'এপ্রিল',
  'মে',
  'জুন',
  'জুলাই',
  'আগস্ট',
  'সেপ্টেম্বর',
  'অক্টোবর',
  'নভেম্বর',
  'ডিসেম্বর',
];

/**
 * `2026-09-23` or an ISO timestamp → `23 September 2026` / `২৩ সেপ্টেম্বর ২০২৬`.
 * Date-only values are parsed as calendar components (not as local midnight),
 * so a Bangladeshi `YYYY-MM-DD` never timezone-shifts into the previous day
 * (Phase 7 / `useI18n` Intl contract). Unparseable input is returned as-is
 * rather than `Invalid Date`.
 */
export type FormatDateOptions = { withTime?: boolean; monthYear?: boolean };

export function formatDate(
  value: string | null | undefined,
  language: Language,
  { withTime = false, monthYear = false }: FormatDateOptions = {},
): string {
  if (!value) return '—';
  const raw = String(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(raw);
  if (!match) return raw;
  const [, year, month, day, hours, minutes] = match;
  const monthName = (language === 'bn' ? BN_MONTHS : EN_MONTHS)[Number(month) - 1] || month;
  const dayNumber = Number(day);
  if (monthYear) {
    return language === 'bn' ? `${monthName} ${toBengaliNumerals(year)}` : `${monthName} ${year}`;
  }
  const time = withTime && hours ? `, ${hours}:${minutes} UTC` : '';
  if (language === 'bn') {
    return `${toBengaliNumerals(dayNumber)} ${monthName} ${toBengaliNumerals(year)}${toBengaliNumerals(time)}`;
  }
  return `${dayNumber} ${monthName} ${year}${time}`;
}

/**
 * A minimal store the React hook subscribes to.
 *
 * The site has no global i18n provider and adding one would mean touching every
 * route; a module-level emitter lets the language toggle and any mounted consumer
 * stay in sync without widening the app's context tree.
 */
type Listener = (language: Language) => void;

let current: Language | null = null;
const listeners = new Set<Listener>();

function readStoredLanguage(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function readNavigatorLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}

/** The active language, resolving a first visit lazily. */
export function getLanguage(): Language {
  if (current) return current;
  current = resolveInitialLanguage({
    stored: readStoredLanguage(),
    navigatorLanguages: readNavigatorLanguages(),
  });
  return current;
}

export function setLanguage(language: Language): Language {
  current = isLanguage(language) ? language : DEFAULT_LANGUAGE;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LANGUAGE_STORAGE_KEY, current);
  } catch {
    /* private mode / storage disabled — the in-memory value still applies */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = languageTag(current);
    document.documentElement.dir = 'ltr';
  }
  for (const listener of listeners) listener(current);
  return current;
}

export function subscribeLanguage(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Test hook: forget the resolved language and any subscribers.
 *
 * Passing a language forces it immediately (and writes `<html lang>`), which is what a
 * component test needs before `render` — otherwise the hook would resolve from jsdom's
 * own `navigator.language` and the assertion would depend on the test runner's locale.
 */
export function resetLanguageForTests(language?: Language): void {
  current = null;
  listeners.clear();
  if (language) setLanguage(language);
}

/** Convenience for non-React callers (service workers excluded — they have no DOM). */
export function translator(language: Language) {
  return (key: string, vars?: Record<string, string | number>) => translate(language, key, vars);
}
