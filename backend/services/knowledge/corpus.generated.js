/**
 * GENERATED FILE — do not edit.
 *
 * Compiled from backend/services/knowledge/corpus.json by
 * scripts/build_knowledge_base.mjs, which also validates it. Regenerate with
 * `npm run build:knowledge`; CI fails on drift with `npm run check:knowledge`.
 *
 * It is a module rather than a JSON import because the corpus has to load in
 * Node 20 (no unflagged import attributes), a Cloudflare Worker isolate and the
 * browser bundle that serves offline mode.
 *
 * 18 public support documents. No research content.
 */
export default {
  "version": 1,
  "policy": {
    "research_excluded": true,
    "note": "Public, source-tagged support knowledge only. No research corpus, model internals, unpublished data or private methodology may be added to this file. Every document names the authority it comes from, and every document is written so that a farmer can act on it without a specialist.",
    "citation_required": true,
    "safety_notice": "HazardNet is not an official warning service. Follow the Bangladesh Meteorological Department (BMD), the Flood Forecasting and Warning Centre (FFWC) and local administration. In an emergency call 999."
  },
  "documents": [
    {
      "id": "helplines-national",
      "title": "National emergency and advisory helplines",
      "category": "directory",
      "authority": "Government of Bangladesh",
      "url": "https://www.hazardnet.live/contact",
      "basis": "repo-artifact",
      "hazards": [],
      "tags": [
        "helpline",
        "emergency",
        "phone",
        "contact",
        "999",
        "1090",
        "16123",
        "16163",
        "16263",
        "hotline",
        "জরুরি",
        "হেল্পলাইন",
        "ফোন",
        "যোগাযোগ",
        "হেল্পলাইনে",
        "যোগাযোগের"
      ],
      "body": "Call these numbers directly; they are national and free of charge.\n- 999 — national emergency (police, fire, ambulance dispatch).\n- 1090 — disaster response and early warning.\n- 16123 — agricultural advisory (Krishi Call Centre), Department of Agricultural Extension.\n- 16163 — Fire Service and Civil Defence.\n- 16263 — health.\n- 109 — women and children helpline.\nFor an approaching hazard, call your Union Parishad office or the Upazila Disaster Management Committee control room first: they hold the local shelter list and the evacuation decision."
    },
    {
      "id": "agencies-official",
      "title": "Which government body is responsible for what",
      "category": "directory",
      "authority": "Government of Bangladesh",
      "url": "https://www.hazardnet.live/documentation",
      "basis": "repo-artifact",
      "hazards": [],
      "tags": [
        "agency",
        "bmd",
        "ffwc",
        "dae",
        "dls",
        "dof",
        "bwdb",
        "brri",
        "bari",
        "ddm",
        "responsibility",
        "department",
        "বিভাগ",
        "অফিস",
        "যোগাযোগ",
        "যোগাযোগের"
      ],
      "body": "Know who to ask, because the wrong office cannot help.\n- Bangladesh Meteorological Department (BMD) — bmd.gov.bd — official weather and cyclone warnings.\n- Flood Forecasting and Warning Centre (FFWC) — ffwc.gov.bd — river levels and flood forecasts.\n- Department of Agricultural Extension (DAE) — dae.gov.bd — crop advice, the Upazila Agriculture Officer (UAO), 16123.\n- Department of Livestock Services (DLS) — dls.gov.bd — animal health, the Upazila Livestock Officer (ULO), vaccination.\n- Department of Fisheries (DoF) — fisheries.gov.bd — ponds, ghers, the Upazila Fisheries Officer (UFO).\n- Bangladesh Water Development Board (BWDB) — bwdb.gov.bd — embankments, polders, sluice gates, irrigation.\n- BRRI and BARI — stress-tolerant crop varieties and seed sources.\n- Department of Disaster Management (DDM) and local administration — evacuation, shelters, relief."
    },
    {
      "id": "flood-preparedness",
      "title": "Riverine and monsoon flood: what to do before, during and after",
      "category": "preparedness",
      "authority": "Department of Agricultural Extension; Department of Disaster Management",
      "url": "http://www.dae.gov.bd",
      "basis": "general-practice",
      "hazards": [
        "flood"
      ],
      "tags": [
        "flood",
        "monsoon",
        "river",
        "submergence",
        "embankment",
        "aman",
        "preparedness",
        "evacuation",
        "বন্যা",
        "ফসল",
        "গবাদি পশু",
        "আশ্রয়কেন্দ্র",
        "বন্যায়",
        "বন্যার",
        "ফসলে",
        "ফসলের",
        "গবাদি পশুর",
        "আশ্রয়কেন্দ্রে"
      ],
      "body": "Before the water arrives: harvest whatever has reached maturity, even slightly early, and move grain, seed and documents to the highest room or a neighbour's two-storey building. Clear the drainage channels around the homestead and the field so water has somewhere to go. Ask the UAO which short-duration variety to replant with if the crop is lost, and register your household with the Union Parishad so you are on the shelter list.\nDuring: do not cross flowing water on foot or by boat at night, and keep children away from flood water. Move livestock to raised ground or a designated animal shelter before access roads close, not after.\nAfter: drain standing water off the field as soon as the flood water starts to fall, and have the field assessed by the UAO before replanting. Treat drinking water before use and watch for diarrhoeal illness."
    },
    {
      "id": "flash-flood-response",
      "title": "Flash flood in the haor and northeast: the harvest-early decision",
      "category": "response",
      "authority": "Department of Agricultural Extension; Flood Forecasting and Warning Centre",
      "url": "http://www.ffwc.gov.bd",
      "basis": "general-practice",
      "hazards": [
        "flash-flood"
      ],
      "tags": [
        "flash flood",
        "haor",
        "sunamganj",
        "sylhet",
        "boro",
        "early harvest",
        "upstream",
        "sudden",
        "আকস্মিক বন্যা",
        "হাওর",
        "ধান",
        "ফসল",
        "হাওরে",
        "হাওরের",
        "ধানে",
        "ধানের",
        "ফসলে",
        "ফসলের"
      ],
      "body": "Flash flood arrives from upstream rainfall within hours to days, so the decision window is short. When a flash-flood outlook is issued for the haor basin, the practical question is whether the Boro crop can be harvested early: cutting at 80–85 percent maturity loses a little yield and saves all of it, while waiting for full maturity risks total loss.\nOrganise harvesting labour before the water arrives, not after, and agree on drying space on higher ground. Move fishing nets, boats and household goods up at the same time.\nTrack the FFWC river-level forecast and the local administration's announcement together; HazardNet's outlook is a planning aid, not a warning."
    },
    {
      "id": "cyclone-preparedness",
      "title": "Tropical cyclone and storm surge: coastal preparation",
      "category": "preparedness",
      "authority": "Bangladesh Meteorological Department; Department of Disaster Management",
      "url": "http://www.bmd.gov.bd",
      "basis": "general-practice",
      "hazards": [
        "tropical-cyclone"
      ],
      "tags": [
        "cyclone",
        "storm surge",
        "coastal",
        "shelter",
        "khulna",
        "barisal",
        "chattogram",
        "coxsbazar",
        "salinity",
        "warning",
        "ঘূর্ণিঝড়",
        "আশ্রয়কেন্দ্র",
        "উপকূল",
        "ঘূর্ণিঝড়ে",
        "ঘূর্ণিঝড়ের",
        "আশ্রয়কেন্দ্রে"
      ],
      "body": "BMD issues the official cyclone warning and the local administration orders the evacuation. When an evacuation is ordered, go to the designated cyclone shelter; do not stay to guard property or livestock.\nBefore landfall: secure the roof, tie down or bring inside anything that can become a projectile, store drinking water and dry food for three days, and keep a torch, a charged phone and your household documents together in one bag.\nProtect the livelihood that will decide your recovery: move livestock to the shelter or to relatives inland, and lower the water level in shrimp ghers so the embankment is not overtopped by surge.\nAfter: assume wells and ponds are saline or contaminated until they have been flushed and checked. Contact the Upazila Fisheries Officer before restocking."
    },
    {
      "id": "drought-heat-crops",
      "title": "Drought and heat wave: protecting crops and water",
      "category": "preparedness",
      "authority": "Department of Agricultural Extension; Bangladesh Agricultural Research Institute",
      "url": "http://www.dae.gov.bd",
      "basis": "general-practice",
      "hazards": [
        "drought",
        "heat-wave"
      ],
      "tags": [
        "drought",
        "heat wave",
        "heat stress",
        "irrigation",
        "awd",
        "alternate wetting and drying",
        "mulch",
        "boro",
        "water",
        "খরা",
        "সেচ",
        "ফসল",
        "পানি",
        "খরায়",
        "খরার",
        "সেচে",
        "সেচের",
        "ফসলে",
        "ফসলের"
      ],
      "body": "In a dry spell the limiting resource is irrigation water, so the first action is to spend less of it. Alternate Wetting and Drying (AWD) for Boro rice lets the field fall to a controlled level between irrigations instead of keeping it continuously flooded; ask the UAO to show the correct water level for your soil, because the technique only works when the drop is measured.\nMulch the soil surface to slow evaporation, irrigate early morning or late evening, and prefer shorter-duration and drought-tolerant varieties where the dry season is predictable.\nFor heat stress in vegetables and nurseries, shade nets and more frequent light irrigation beat one heavy irrigation. Watch livestock water supply at the same time — heat stress kills animals faster than it kills crops."
    },
    {
      "id": "cold-wave-fog",
      "title": "Cold wave and dense fog: seedlings, vegetables and livestock",
      "category": "preparedness",
      "authority": "Department of Agricultural Extension",
      "url": "http://www.dae.gov.bd",
      "basis": "general-practice",
      "hazards": [
        "cold-wave"
      ],
      "tags": [
        "cold wave",
        "cold stress",
        "fog",
        "frost",
        "seedling",
        "nursery",
        "mustard",
        "winter",
        "rangpur",
        "protect",
        "ঠান্ডা",
        "কুয়াশা",
        "চারা"
      ],
      "body": "Cold injury is worst for young seedlings, nurseries and flowering crops. Light irrigation in the late afternoon raises the temperature around the canopy overnight, and a mulch of straw or water hyacinth protects the root zone.\nDelay transplanting until the cold spell is forecast to lift, and cover nursery beds at night with straw or polythene on a frame rather than laying the cover on the seedlings.\nDense fog reduces sunlight for days, so avoid applying nitrogen during a fog spell; the crop cannot use it and it leaches.\nLivestock need a dry, draught-free shed with extra bedding — damp cold kills calves and poultry faster than dry cold. Contact the ULO for advice before treating sick animals."
    },
    {
      "id": "severe-local-storm",
      "title": "Severe local storm (nor'wester / kalboishakhi): short-warning protection",
      "category": "response",
      "authority": "Bangladesh Meteorological Department; Department of Agricultural Extension",
      "url": "http://www.bmd.gov.bd",
      "basis": "general-practice",
      "hazards": [
        "severe-local-storm"
      ],
      "tags": [
        "severe local storm",
        "norwester",
        "kalboishakhi",
        "hail",
        "wind gust",
        "lodging",
        "mango",
        "litchi",
        "pre-monsoon",
        "কালবৈশাখী",
        "ঝড়",
        "শিলাবৃষ্টি"
      ],
      "body": "Severe local storms give little warning and damage is done by wind and hail in minutes. The useful preparations are the standing ones: harvest mature fruit and grain as soon as it is ready during the pre-monsoon season, and keep the drying floor covered.\nStrengthen the roof and the cattle shed before the season rather than during it, and plant or maintain windbreaks around orchards and homesteads.\nAfter a storm, walk the field before deciding: lodged crops can often be partially recovered if they are lifted and bundled within a day or two, while hail-damaged fruit should be removed to stop disease spreading. Report the damage to the UAO so it enters the official loss record."
    },
    {
      "id": "fire-land-homestead",
      "title": "Fire risk on the homestead, in the field and in the market",
      "category": "preparedness",
      "authority": "Fire Service and Civil Defence",
      "url": "https://www.hazardnet.live/contact",
      "basis": "repo-artifact",
      "hazards": [
        "fire"
      ],
      "tags": [
        "fire",
        "electrical",
        "stove",
        "16163",
        "dry season",
        "storage",
        "market",
        "prevention",
        "আগুন",
        "অগ্নিকাণ্ড",
        "আগুনে",
        "আগুনের"
      ],
      "body": "Call 16163 (Fire Service and Civil Defence) immediately and give the nearest landmark, not just the village name.\nMost rural fires start from cooking stoves, kerosene lamps and faulty wiring. Keep the stove area clear of straw and husk, extinguish the stove before leaving the house, and replace damaged wiring rather than repairing it with tape.\nStore harvest residue away from the house and the cattle shed, and do not burn stubble next to standing crops or a market shed in the dry season. Agree a water source and a bucket chain with neighbours before the dry season — the first ten minutes decide the loss."
    },
    {
      "id": "livestock-protection",
      "title": "Livestock: shelter, fodder, water and disease through a hazard",
      "category": "livestock",
      "authority": "Department of Livestock Services",
      "url": "http://www.dls.gov.bd",
      "basis": "general-practice",
      "hazards": [
        "flood",
        "flash-flood",
        "tropical-cyclone",
        "cold-wave",
        "heat-wave"
      ],
      "tags": [
        "livestock",
        "cattle",
        "goat",
        "poultry",
        "fodder",
        "shelter",
        "vaccination",
        "ulo",
        "disease",
        "animal",
        "গবাদি পশু",
        "গরু",
        "ছাগল",
        "হাঁস-মুরগি",
        "খাদ্য",
        "গবাদি পশুর"
      ],
      "body": "Animals die in hazards from drowning, exposure, starvation and the disease that follows — in that order.\nBefore: move animals to raised ground or a designated animal shelter, and store at least a week of fodder above flood level. A cow that has eaten nothing for three days does not recover its condition.\nDuring: do not tie animals so they cannot move, and keep drinking water clean — animals that drink flood water carry disease into the recovery period.\nAfter: the highest risk is an outbreak, so report deaths and sick animals to the Upazila Livestock Officer (ULO) rather than treating them privately, and ask about the vaccination schedule for your upazila. Dispose of carcasses by burial or as the ULO directs; never into a pond or a canal.\nSelling distressed animals at the lowest point of the cycle is usually a worse loss than feeding them through — ask the ULO before selling."
    },
    {
      "id": "fisheries-pond-gher",
      "title": "Fisheries: protecting ponds, ghers and stock",
      "category": "fisheries",
      "authority": "Department of Fisheries",
      "url": "http://www.fisheries.gov.bd",
      "basis": "general-practice",
      "hazards": [
        "flood",
        "flash-flood",
        "tropical-cyclone",
        "drought"
      ],
      "tags": [
        "fisheries",
        "pond",
        "gher",
        "shrimp",
        "fish",
        "embankment",
        "net",
        "stock",
        "ufo",
        "aquaculture",
        "মাছ",
        "মৎস্য",
        "পুকুর",
        "ঘের",
        "মাছে",
        "মাছের",
        "পুকুরে",
        "পুকুরের",
        "ঘেরে",
        "ঘেরের"
      ],
      "body": "The structure is the stock: if the embankment goes, the crop goes with it.\nBefore a flood or surge: raise and compact the embankment, install a net or screen on the inlet and outlet so fish cannot leave with the overflow, and lower the water level so wave action does not overtop the dyke.\nDuring: patrol the embankment and repair seepage immediately — a small leak becomes a breach in an hour.\nAfter: the pond water has usually changed completely. Ask the Upazila Fisheries Officer (UFO) about the condition of the water and the correct treatment before restocking, and restock from a licensed hatchery rather than from flood-water collections.\nIn a dry spell the opposite applies: deepen part of the pond as a refuge, shade the surface, and reduce feeding so uneaten feed does not foul a smaller water volume."
    },
    {
      "id": "recovery-crops",
      "title": "Recovering the field after a flood or surge",
      "category": "recovery",
      "authority": "Department of Agricultural Extension; Bangladesh Agricultural Research Institute",
      "url": "http://www.dae.gov.bd",
      "basis": "general-practice",
      "hazards": [
        "flood",
        "flash-flood",
        "tropical-cyclone"
      ],
      "tags": [
        "recovery",
        "replant",
        "recession",
        "drainage",
        "seed",
        "badc",
        "top dress",
        "assessment",
        "loss",
        "ফসল",
        "বীজ",
        "পুনরায় রোপণ",
        "ফসলে",
        "ফসলের",
        "বীজে",
        "বীজের"
      ],
      "body": "The first three days after recession decide most of the recovery. Drain standing water as early as the falling water allows, because a waterlogged root zone kills a crop that survived the flood itself.\nHave the field assessed before replanting. The Upazila Agriculture Officer can tell you whether the surviving stand will recover, which short-duration variety fits the remaining season, and what seed is available through BADC or local dealers.\nWhere the crop is lost, a fast vegetable or a short-duration rice is usually a better use of the land than waiting for the next full season. Report the loss to the UAO so it is recorded — relief and input support follow the official record, not the actual damage.\nLift lodged crops within a day or two, and do not apply a full fertiliser dose to a stressed crop; a small top dressing once growth restarts is enough."
    },
    {
      "id": "wash-after-flood",
      "title": "Water, sanitation and health after a flood",
      "category": "recovery",
      "authority": "Department of Public Health Engineering; local health services",
      "url": "https://www.hazardnet.live/contact",
      "basis": "general-practice",
      "hazards": [
        "flood",
        "flash-flood",
        "tropical-cyclone"
      ],
      "tags": [
        "wash",
        "water",
        "sanitation",
        "tube well",
        "diarrhoea",
        "ors",
        "health",
        "16263",
        "hygiene",
        "contamination",
        "পানি",
        "স্বাস্থ্য",
        "পয়ঃনিষ্কাশন"
      ],
      "body": "More people fall ill after a flood than during it, almost all of it waterborne.\nUse treated or boiled water for drinking and cooking until the tube well has been made safe; ask the local health worker or the Union Parishad about the correct treatment for your well, because the method and the amount depend on the well.\nKeep the latrine usable and away from the water source, wash hands with soap or ash, and dispose of animal carcasses away from water.\nWatch for diarrhoea, fever and skin infection. Start oral rehydration immediately for diarrhoea and contact the health service (16263, or the nearest Upazila Health Complex) rather than waiting — dehydration is what kills, and it kills children fastest."
    },
    {
      "id": "seed-varieties",
      "title": "Stress-tolerant crop varieties and where seed comes from",
      "category": "crops",
      "authority": "Bangladesh Rice Research Institute; Bangladesh Agricultural Research Institute; BADC",
      "url": "https://www.hazardnet.live/documentation",
      "basis": "repo-artifact",
      "hazards": [
        "flood",
        "flash-flood",
        "tropical-cyclone",
        "drought",
        "heat-wave"
      ],
      "tags": [
        "variety",
        "seed",
        "brri",
        "bari",
        "badc",
        "dhan",
        "submergence",
        "salinity",
        "drought",
        "heat",
        "wheat",
        "বীজ",
        "ধান",
        "জাত",
        "বীজে",
        "বীজের",
        "ধানে",
        "ধানের"
      ],
      "body": "Publicly released stress-tolerant varieties relevant to Bangladesh hazards include BRRI dhan49, BRRI dhan51 and BRRI dhan52 for submergence, BRRI dhan47 and BRRI dhan53 for salinity, BRRI dhan56 for drought, BRRI dhan71 for late-season flooding, and BARI Gom-33 for heat-tolerant wheat.\nTwo things decide whether a variety helps you: whether it suits your agro-ecological zone and season, and whether you can get genuine seed. Buy certified seed from BADC or a licensed dealer, and ask the UAO which variety fits your field before you buy — the wrong zone is a worse loss than no replant.\nAsk specifically about germination date and the variety's duration against the remaining days in your season."
    },
    {
      "id": "reading-severity-index",
      "title": "How to read HazardNet's severity index and confidence",
      "category": "explainer",
      "authority": "HazardNet",
      "url": "https://www.hazardnet.live/documentation",
      "basis": "repo-artifact",
      "hazards": [],
      "tags": [
        "severity index",
        "confidence",
        "score",
        "0-100",
        "physics",
        "model",
        "how to read",
        "methodology",
        "provenance",
        "ঝুঁকি",
        "সতর্কতা"
      ],
      "body": "Every published outlook carries a severity index from 0 to 100 for a district, hazard and date, alongside a confidence value and the model's provenance.\nRead the index as a ranking aid, not as a probability: a higher index means more of the model's hazard signal, not a percentage chance of harm. Published confidence is an uncalibrated model softmax — it describes how peaked the model's own output was, not how likely the event is.\nSeverity is produced on two tracks, a model track and an independent physics cross-check, and the page shows when they disagree. A disagreement is a reason to look at the drivers, not to split the difference.\nAn empty or absent result is not an all-clear; it means the run did not produce a row for that district, hazard and date."
    },
    {
      "id": "hazardnet-limits",
      "title": "What HazardNet is, and what it is not",
      "category": "safety",
      "authority": "HazardNet",
      "url": "https://www.hazardnet.live/about",
      "basis": "repo-artifact",
      "hazards": [],
      "tags": [
        "disclaimer",
        "limits",
        "not a warning",
        "official",
        "bmd",
        "ffwc",
        "999",
        "responsibility",
        "trust",
        "সতর্কতা",
        "জরুরি"
      ],
      "body": "HazardNet is a decision-support tool for planning. It is not an official warning service and it cannot issue one.\nOfficial warnings come from the Bangladesh Meteorological Department, river and flood forecasts from the Flood Forecasting and Warning Centre, and evacuation orders from the local administration. When any of those conflict with a HazardNet outlook, follow the official source.\nUse the outlook to prepare earlier — to harvest, move animals, raise an embankment, or buy seed — and use the official channels to decide whether to act now.\nIn an emergency call 999. For disaster response, 1090. For agricultural advice, 16123."
    },
    {
      "id": "local-officers",
      "title": "Reaching your local agriculture, livestock and fisheries officer",
      "category": "directory",
      "authority": "Government of Bangladesh",
      "url": "https://www.hazardnet.live/contact",
      "basis": "repo-artifact",
      "hazards": [],
      "tags": [
        "uao",
        "ulo",
        "ufo",
        "upazila",
        "officer",
        "control room",
        "union parishad",
        "local",
        "contact",
        "ddm",
        "কৃষি অফিসার",
        "উপজেলা",
        "যোগাযোগ",
        "কৃষি অফিসারের",
        "যোগাযোগের"
      ],
      "body": "Most hazard decisions are local, and the officers who make them are at upazila level.\n- Upazila Agriculture Officer (UAO) — crop damage assessment, variety and input advice, the official loss record. Reachable through the Upazila Agriculture Office or the Krishi Call Centre on 16123.\n- Upazila Livestock Officer (ULO) — animal disease, vaccination, carcass disposal.\n- Upazila Fisheries Officer (UFO) — pond and gher condition, restocking.\n- Upazila Disaster Management Committee and Union Parishad — shelter lists, evacuation, relief distribution.\nWhen you report damage, give the date, the area affected and the crop stage; an assessment without those is usually sent back."
    },
    {
      "id": "early-action-by-hazard",
      "title": "First 48 hours: the action that matters most for each hazard",
      "category": "response",
      "authority": "HazardNet, compiled from DAE, DLS, DoF and DDM practice",
      "url": "https://www.hazardnet.live/documentation",
      "basis": "general-practice",
      "hazards": [
        "flood",
        "flash-flood",
        "tropical-cyclone",
        "drought",
        "heat-wave",
        "cold-wave",
        "fire",
        "severe-local-storm"
      ],
      "tags": [
        "first 48 hours",
        "action",
        "checklist",
        "priority",
        "what to do",
        "quick",
        "decision",
        "all hazards",
        "বন্যা",
        "ঘূর্ণিঝড়",
        "খরা",
        "আগুন",
        "ফসল",
        "বন্যায়",
        "বন্যার",
        "ঘূর্ণিঝড়ে",
        "ঘূর্ণিঝড়ের",
        "খরায়",
        "খরার",
        "আগুনে",
        "আগুনের",
        "ফসলে",
        "ফসলের"
      ],
      "body": "If you only do one thing in the next 48 hours, do this.\n- Flood: harvest what is mature and move livestock and grain to high ground before the roads close.\n- Flash flood: decide on early harvest of the Boro crop and secure harvesting labour now.\n- Cyclone: secure the roof and know which shelter your household goes to; move animals inland.\n- Drought or heat wave: cut irrigation losses first — AWD, mulch, irrigate at dawn or dusk — and check animal water.\n- Cold wave: irrigate in the late afternoon and cover nursery beds at night.\n- Severe local storm: harvest mature fruit and grain; keep the drying floor covered.\n- Fire: clear straw and husk from the stove and the store, and agree a water source with neighbours.\nThen report the situation to the UAO or Union Parishad so the official record starts early."
    }
  ]
};
