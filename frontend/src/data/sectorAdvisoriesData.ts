export interface TechnicalStep {
  stepNumber: string;
  title: string;
  phase: 'pre-disaster' | 'during-event' | 'post-disaster';
  timeline: string;
  leadAgency: string;
  triggerThreshold: string;
  detailedProtocol: string;
  technicalSpecs: string[];
  equipmentNeeded: string[];
  criticalWarning?: string;
}

export interface CultivarOrInputSpec {
  name: string;
  category: string;
  toleranceLevel: string;
  recommendedDosage: string;
  targetCondition: string;
  notes: string;
}

export interface OfficialDocLink {
  title: string;
  issuingBody: string;
  docType: 'Official Portal' | 'National Gazette' | 'Technical Manual' | 'Research Bulletin' | 'WHO/UN Guideline';
  url: string;
  description: string;
}

export interface EmergencyContact {
  agencyName: string;
  departmentOrCell: string;
  roleOrDesignation: string;
  hotline: string;
  landline?: string;
  officialEmail: string;
  address: string;
  scope: 'Government of Bangladesh' | 'International Humanitarian Agency';
}

export interface SectorAdvisoryData {
  id: string;
  name: string;
  fullTitle: string;
  code: string;
  iconName: string;
  themeColor: string;
  badge: string;
  leadAuthorities: string[];
  sodReference: string;
  executiveSummary: string;
  hazardVulnerabilitySummary: string;
  phasedProtocols: TechnicalStep[];
  technicalSpecs: CultivarOrInputSpec[];
  officialDocumentation: OfficialDocLink[];
  emergencyContacts: EmergencyContact[];
  emailTemplate: {
    subject: string;
    recipientDefault: string;
    bodyStructure: string;
  };
}

export const SECTOR_ADVISORIES: Record<string, SectorAdvisoryData> = {
  crops: {
    id: 'crops',
    name: 'Crop Protection & Agronomy',
    fullTitle: 'BRRI / DAE / BARI Crop Resilience & Disaster Contingency Protocols',
    code: 'CROP-SOP',
    iconName: 'agriculture',
    themeColor: 'emerald',
    badge: 'National Agricultural Standard (BRRI/DAE 2026)',
    leadAuthorities: [
      'Department of Agricultural Extension (DAE)',
      'Bangladesh Rice Research Institute (BRRI)',
      'Bangladesh Agricultural Research Institute (BARI)',
      'Agriculture Information Service (AIS)'
    ],
    sodReference: 'Standing Orders on Disaster (SOD 2019) Clause 4.2.1 (Ministry of Agriculture)',
    executiveSummary: 'Mandatory technical standard operating procedures for cereal, pulse, oilseed, and horticulture preservation before, during, and after extreme hydro-meteorological shocks across Bangladesh agro-ecological zones (AEZs).',
    hazardVulnerabilitySummary: 'Flash flood inundation in Haor regions (Sylhet, Sunamganj), monsoon riverine flooding in Brahmaputra-Jamuna & Padma basins, cyclone storm surge in southern coastal belt, and salinity intrusion in Khulna/Barishal divisions.',
    phasedProtocols: [
      {
        stepNumber: '1.1',
        title: 'Flash Flood & Monsoon Early Warning Harvest (80% Grain Maturity Rule)',
        phase: 'pre-disaster',
        timeline: 'T-72h to T-24h before predicted crest',
        leadAgency: 'DAE Field Extension & SAAO Network',
        triggerThreshold: 'FFWC river stage forecast > Danger Level (DL) +0.3m within 48 hours or rainfall > 150mm/24h in upstream catchment.',
        detailedProtocol: 'Mobilize combined harvesters and reaper machinery for immediate harvesting of Boro and Aus paddy that have attained 80% physiological maturity (golden-yellow panicle with hard dough stage). Harvested grains must be immediately shifted to elevated community drying yards or Union Parishad storage facilities.',
        technicalSpecs: [
          '80% grain yellowing threshold prevents over 92% yield loss compared to full submergence',
          'Grain moisture reduction target: Sun-dry to 12-14% moisture before poly-bag sealing'
        ],
        equipmentNeeded: ['Combined Harvesters', 'Reapers', 'Moisture Meters', 'Silpaulin Waterproof Tarpaulins'],
        criticalWarning: 'Never leave unthreshed paddy in open low-lying fields if FFWC issues flash flood alert.'
      },
      {
        stepNumber: '1.2',
        title: 'Emergency Seedbed Relocation & Floating Dhap (Baira) Establishment',
        phase: 'pre-disaster',
        timeline: 'T-48h to T-12h',
        leadAgency: 'BRRI Extension Division & DAE Agrometeorology Wing',
        triggerThreshold: 'Predicted continuous submergence of lowland nurseries for > 5 days.',
        detailedProtocol: 'Construct floating seedbeds (Dhap/Baira) using water hyacinth (Eichhornia crassipes), bamboo rafts, and decomposed compost in waterlogged areas. Alternatively, establish raised wet-bed nurseries in elevated highland homesteads (Killa/Uchu Jomi) with 15 cm drainage ditches.',
        technicalSpecs: [
          'Dhap dimensions: 10m length × 1.5m width × 0.6m thickness compacted water hyacinth base',
          'Top dressing: 2-3 cm layer of composted pond silt mixed with decomposed cowdung (1:1 ratio)',
          'Seeding density: 80-100g sprouted seed per square meter'
        ],
        equipmentNeeded: ['Bamboo poles', 'Water hyacinth biomass', 'Nylon binding twine', 'Compost'],
      },
      {
        stepNumber: '2.1',
        title: 'Drainage Channel Unclogging & Levee Inflow Control',
        phase: 'during-event',
        timeline: 'T-0 to T+36h (Active Shock Phase)',
        leadAgency: 'Union Disaster Management Committee (UDMC) & DAE',
        triggerThreshold: 'Intense precipitation rate > 50 mm/hour or canal water backflow.',
        detailedProtocol: 'Cut localized breach relief cuts (Nal-Kata) on outer embankment drains to evacuate standing water into main drainage arteries. In salinity-prone coastal polders, seal all wooden sluice gates (Flap Gates) with clay packing to prevent tidal marine water ingress.',
        technicalSpecs: [
          'Maintain water level in Aman rice fields to maximum 5-7 cm depth during vegetative phase',
          'Coastal polder soil salinity threshold: Prevent EC exceeding 4.0 dS/m during seedling stage'
        ],
        equipmentNeeded: ['Spades & Earthmovers', 'Sandbags (polypropylene woven)', 'Clay sealant'],
        criticalWarning: 'Do not allow brackish tidal surge to enter enclosed polders; inspect sluice gate seals twice daily during high tide.'
      },
      {
        stepNumber: '2.2',
        title: 'Foliar Nutrient Staging for Submergence Recovery Preparation',
        phase: 'during-event',
        timeline: 'T+24h to T+48h',
        leadAgency: 'DAE Upazila Agriculture Office',
        triggerThreshold: 'Turbid floodwaters receding or continuous cloudy/waterlogged stress.',
        detailedProtocol: 'Prepare foliar spray solutions containing Zinc Sulfate heptahydrate (ZnSO4.7H2O) and Muriate of Potash (MoP) to strengthen plant vascular tissue and prevent post-submergence bacterial leaf blight (Xanthomonas oryzae).',
        technicalSpecs: [
          'Foliar formulation: 0.5% ZnSO4 (5g/L) + 1.0% Urea (10g/L) + 0.5% MoP (5g/L) in clear water',
          'Application time: Early morning or late afternoon immediately after leaves emerge above water level'
        ],
        equipmentNeeded: ['Knapsack sprayers', 'Protective masks', 'Analytical scales for chemical dosing'],
      },
      {
        stepNumber: '3.1',
        title: 'Post-Submergence Silt Cleansing & Re-Planting (Charo / Double Transplanting)',
        phase: 'post-disaster',
        timeline: 'T+3d to T+14d',
        leadAgency: 'BRRI Regional Stations & DAE Field Wing',
        triggerThreshold: 'Floodwater fully receded; silt deposited on surviving rice hills.',
        detailedProtocol: 'Wash sediment deposits off rice leaves using clean water sprays to restore photosynthetic stomatal function. In completely destroyed fields, perform double transplanting (Charo method) using 45-60 day old seedlings or broadcast short-duration pulse varieties (Blackgram / Mashkalai).',
        technicalSpecs: [
          'Charo seedling separation: Split healthy tillers from un-submerged highland fields into 2-3 culms per hill',
          'Short-duration contingency crops: BARI Mash-3 (Blackgram), BARI Khesari-2, or BINA Sarisha-9'
        ],
        equipmentNeeded: ['Water spray nozzles', 'Split-culm seedling trays', 'Certified contingency seeds'],
      },
      {
        stepNumber: '3.2',
        title: 'Agricultural Rehabilitation Fund & Free Seed Input Distribution',
        phase: 'post-disaster',
        timeline: 'T+7d to T+30d',
        leadAgency: 'Ministry of Agriculture & Upazila Agricultural Rehabilitation Committee',
        triggerThreshold: 'Official crop damage declaration under SOD Clause 4.2.5.',
        detailedProtocol: 'Compile geotagged damage assessments via HazardNet platform and distribute government-subsidized agricultural incentive packages (Pranodona) containing certified BRRI/BARI seeds, Diammonium Phosphate (DAP), and MoP fertilizer directly to marginalized smallholders.',
        technicalSpecs: [
          'Per bigha package: 5kg certified paddy seed + 10kg DAP + 10kg MoP',
          'Target priority: Female-headed farming households and landless sharecroppers (Borgachashi)'
        ],
        equipmentNeeded: ['Digital farmer biometric verification', 'Seed storage containers'],
      }
    ],
    technicalSpecs: [
      {
        name: 'BRRI dhan51 / BRRI dhan52 (Sub1 Rice)',
        category: 'Paddy Variety',
        toleranceLevel: 'Complete submergence tolerance for 14-18 days',
        recommendedDosage: 'Seed rate: 30-35 kg/ha; Seedling age: 30-35 days',
        targetCondition: 'Flash flood & stagnant monsoon inundation',
        notes: 'Contains Sub1A gene; maintains low elongation during inundation to conserve carbohydrate reserves.'
      },
      {
        name: 'BRRI dhan79',
        category: 'Paddy Variety',
        toleranceLevel: 'Submergence tolerance up to 21 days + anaerobic germination',
        recommendedDosage: 'Seed rate: 30 kg/ha; Spacing: 20cm × 15cm',
        targetCondition: 'High-risk flash flood prone river basins',
        notes: 'Yields 5.5-6.0 t/ha under optimal management with quick post-flood rejuvenation.'
      },
      {
        name: 'BRRI dhan67 / BRRI dhan73',
        category: 'Paddy Variety',
        toleranceLevel: 'Salinity tolerance up to 8-10 dS/m (seedling) and 6-8 dS/m (reproductive)',
        recommendedDosage: 'Seed rate: 35 kg/ha; Transplanting: 35-day seedlings',
        targetCondition: 'Coastal saline polders (Khulna, Satkhira, Bagerhat, Patuakhali)',
        notes: 'Boro season champion with superior grain elongation and cooking quality.'
      },
      {
        name: 'BARI Gom-33 (Biofortified Wheat)',
        category: 'Cereal Variety',
        toleranceLevel: 'Blast resistant + terminal heat tolerance up to 34°C',
        recommendedDosage: 'Seed rate: 120 kg/ha; Sowing window: Nov 15 - Dec 05',
        targetCondition: 'Post-flood Rabi contingency in northern and western zones',
        notes: 'High zinc content (50 ppm Zn); critical for post-disaster household nutritional security.'
      },
      {
        name: 'Zinc Sulfate Heptahydrate + Urea Foliar',
        category: 'Agrochemical Formulation',
        toleranceLevel: 'Rapid plant metabolism kickstarter',
        recommendedDosage: '5g ZnSO4 + 10g Urea per 1 Liter water (0.5% + 1.0%)',
        targetCondition: 'Post-submergence leaf chlorosis and root asphyxia',
        notes: 'Spray 500 liters of solution per hectare within 48 hours after floodwater recedes.'
      }
    ],
    officialDocumentation: [
      {
        title: 'BRRI Rice Knowledge Bank & Variety Database',
        issuingBody: 'Bangladesh Rice Research Institute (BRRI)',
        docType: 'Official Portal',
        url: 'https://knowledgebank-brri.org/',
        description: 'Comprehensive digital repository of all 115+ BRRI rice varieties, stress-tolerant cultivation guidelines, and pest management bulletins.'
      },
      {
        title: 'DAE Krishi Batayan (National Agricultural Extension Portal)',
        issuingBody: 'Department of Agricultural Extension (DAE)',
        docType: 'Official Portal',
        url: 'https://dae.gov.bd/',
        description: 'Official directives, Upazila Agriculture Officer rosters, disaster compensation guidelines, and weekly agrometeorological advisories.'
      },
      {
        title: 'Standing Orders on Disaster (SOD 2019) - MoDMR',
        issuingBody: 'Ministry of Disaster Management and Relief',
        docType: 'National Gazette',
        url: 'https://modmr.gov.bd/',
        description: 'Authorized legal framework detailing responsibilities of the Ministry of Agriculture and field-level committees during emergencies.'
      },
      {
        title: 'Agriculture Information Service (AIS) Digital Media Hub',
        issuingBody: 'Agriculture Information Service (AIS)',
        docType: 'Technical Manual',
        url: 'https://ais.gov.bd/',
        description: 'Audio-visual training materials, Krishi Katha bulletins, and emergency radio broadcast scripts for rural farmers.'
      },
      {
        title: 'FAO Bangladesh Emergency & Resilience Agronomy Hub',
        issuingBody: 'Food and Agriculture Organization of the United Nations (FAO)',
        docType: 'WHO/UN Guideline',
        url: 'https://www.fao.org/bangladesh/en/',
        description: 'International best practices for shock-responsive agricultural systems and seed security assessment in the Bengal Delta.'
      }
    ],
    emergencyContacts: [
      {
        agencyName: 'Department of Agricultural Extension (DAE)',
        departmentOrCell: 'Central Disaster Control Room & Agrometeorology Wing',
        roleOrDesignation: 'Director (Field Services Wing) / Agromet Coordinator',
        hotline: '16123 (Krishi Call Centre - Toll Free)',
        landline: '+88-02-55028400',
        officialEmail: 'controlroom@dae.gov.bd',
        address: 'Khamarbari, Farmgate, Dhaka-1215, Bangladesh',
        scope: 'Government of Bangladesh'
      },
      {
        agencyName: 'Bangladesh Rice Research Institute (BRRI)',
        departmentOrCell: 'Adaptive Research & Extension Division (ARED)',
        roleOrDesignation: 'Director General & Chief Scientific Officer',
        hotline: '+88-02-49272005',
        landline: '+88-02-49272006',
        officialEmail: 'dg@brri.gov.bd',
        address: 'BRRI Headquarters, Gazipur-1701, Bangladesh',
        scope: 'Government of Bangladesh'
      },
      {
        agencyName: 'Food and Agriculture Organization (FAO) Bangladesh',
        departmentOrCell: 'Emergency and Resilience Unit (Agriculture Cluster)',
        roleOrDesignation: 'Emergency Operations Coordinator',
        hotline: '+88-02-58153800',
        officialEmail: 'FAO-BD@fao.org',
        address: 'UN Offices, House 37, Road 8, Dhanmondi R/A, Dhaka-1205',
        scope: 'International Humanitarian Agency'
      }
    ],
    emailTemplate: {
      subject: '[EMERGENCY-AGRICULTURE] Urgent Request for Contingency Seed & Agro-Rehabilitation Support - District: [DISTRICT_NAME]',
      recipientDefault: 'controlroom@dae.gov.bd, dg@brri.gov.bd, FAO-BD@fao.org',
      bodyStructure: `To:
Director, Field Services Wing, Department of Agricultural Extension (controlroom@dae.gov.bd)
Director General, BRRI (dg@brri.gov.bd)
Emergency Coordinator, FAO Bangladesh (FAO-BD@fao.org)

Subject: [EMERGENCY-AGRICULTURE] Urgent Request for Contingency Seed & Agro-Rehabilitation Support - District: [DISTRICT_NAME]

Dear Sir/Madam,

In accordance with the Standing Orders on Disaster (SOD 2019), this official communication reports severe agricultural disruption in District: [DISTRICT_NAME], Upazila(s): [UPAZILAS_AFFECTED] due to ongoing [HAZARD_TYPE: Flood/Salinity/Cyclone].

1. ESTIMATED DAMAGE TELEMETRY:
- Inundated Cropland Area: [AREA_IN_HECTARES] Ha
- Standing Crops Affected: Boro / Aman / Aus / Vegetables / Pulses
- Crop Stage: Seedling / Tillering / Booting / Flowering / Mature
- Total Exposed Farming Households: [HOUSEHOLDS_COUNT]

2. IMMEDIATE INPUT REQUISITIONS NEEDED:
- Submergence/Salinity Tolerant Certified Seed: [VARIETY: e.g. BRRI dhan51/52/79/67] - Quantity: [QUANTITY_METRIC_TONS] MT
- Polyethylene Silpaulin Sheets for Nursery Protection: [PIECES_COUNT] units
- Fertilizers for Foliar/Basal Rehabilitation: DAP: [DAP_MT] MT, MoP: [MOP_MT] MT, ZnSO4: [ZINC_MT] MT
- Portable High-Efficiency Dewatering Pumps: [PUMP_UNITS] units

3. FIELD COORDINATION POINT:
- District Agricultural Officer / SAAO Lead: [OFFICER_NAME]
- Mobile / WhatsApp Hotline: [OFFICER_PHONE]
- Geotagged Field Coordinates: [COORDINATES]

We request expedited mobilization of the National Agriculture Incentive Package (Pranodona) and immediate dispatch of the regional mobile technical assistance team.

Sincerely,
[YOUR_NAME_AND_DESIGNATION]
[ORGANIZATION / UPAZILA DISASTER COMMITTEE]
Contact: [PHONE_NUMBER]`
    }
  },

  livestock: {
    id: 'livestock',
    name: 'Livestock & Veterinary Care',
    fullTitle: 'DLS / BLRI Livestock Safeguards, Feed Staging & Veterinary Emergency Protocols',
    code: 'CATTLE-SOP',
    iconName: 'pets',
    themeColor: 'amber',
    badge: 'National Veterinary Protocol (DLS/BLRI 2026)',
    leadAuthorities: [
      'Department of Livestock Services (DLS)',
      'Bangladesh Livestock Research Institute (BLRI)',
      'Ministry of Fisheries and Livestock (MoFL)'
    ],
    sodReference: 'Standing Orders on Disaster (SOD 2019) Clause 4.3.2 (Livestock Emergency Directives)',
    executiveSummary: 'Standard operating procedures for livestock shelter staging on Mujib Killas, mass vaccination campaigns against Anthrax, Black Quarter (BQ), and Foot-and-Mouth Disease (FMD), silage preservation, and biosecure carcass disposal.',
    hazardVulnerabilitySummary: 'High mortality risks during cyclone storm surges in coastal districts (Bhola, Barguna, Noakhali), prolonged fodder starvation during riverine floods in Kurigram, Gaibandha, and Sirajganj, and heat stroke during summer heatwaves.',
    phasedProtocols: [
      {
        stepNumber: '1.1',
        title: 'Emergency Livestock Evacuation to Raised Mujib Killas & Staged High Grounds',
        phase: 'pre-disaster',
        timeline: 'T-72h to T-24h',
        leadAgency: 'DLS Upazila Livestock Office & Cyclone Preparedness Programme (CPP)',
        triggerThreshold: 'BMD Cyclone Great Danger Signal No. 8-10 or FFWC flood forecast exceeding high embankment crest.',
        detailedProtocol: 'Evacuate dairy cattle, bullocks, goats, and sheep to elevated earthen platforms (Mujib Killas) and reinforced school grounds. Tether animals with quick-release slipknots to prevent strangulation during sudden flash water rise.',
        technicalSpecs: [
          'Mujib Killa capacity standard: 500-800 cattle per typical 1-acre raised platform (>3.5m above HFL)',
          'Segregation rule: Separate horned cattle from calves and small ruminants to prevent trampling'
        ],
        equipmentNeeded: ['Nylon halter ropes with quick-release clips', 'Portable cattle ramps', 'Solar floodlights'],
        criticalWarning: 'Never lock livestock inside enclosed low-lying barns when storm surge or flash flood warnings are active.'
      },
      {
        stepNumber: '1.2',
        title: 'Emergency Fodder Stockpiling & Urea-Molasses-Straw (UMS) Preparation',
        phase: 'pre-disaster',
        timeline: 'T-48h to T-12h',
        leadAgency: 'BLRI Animal Nutrition Division & DLS Extension',
        triggerThreshold: 'Disruption of grazing pasture imminent due to continuous rainfall or submergence.',
        detailedProtocol: 'Prepare Urea-Molasses-Straw (UMS) blocks and airtight poly-wrapped silage from high-yielding perennial grasses (Napier, Pakchong, Jumbo). Stack dry straw bales on elevated wooden stilts covered with heavy tarpaulins.',
        technicalSpecs: [
          'UMS Formulation ratio (for 100 kg dry straw): 82 kg chopped dry straw + 15 kg Molasses + 3 kg Fertilizer-grade Urea dissolved in 40 liters clean water',
          'Silage curing: Compact chopped green grass tightly into 50-micron airtight silo bags to achieve anaerobic lactic fermentation (pH < 4.2)'
        ],
        equipmentNeeded: ['Straw choppers', 'Plastic silo bags (50kg capacity)', 'Drum mixers for molasses'],
      },
      {
        stepNumber: '2.1',
        title: 'Active Event Water Decontamination & Cold-Chain Vaccine Protection',
        phase: 'during-event',
        timeline: 'T-0 to T+48h',
        leadAgency: 'DLS Rapid Veterinary Response Team (RVRT)',
        triggerThreshold: 'Drinking water source contamination and power grid blackout at veterinary stores.',
        detailedProtocol: 'Provide animals with clean decontaminated drinking water treated with potassium permanganate (KMnO4) or bleaching powder. Transfer emergency vaccine cold boxes to solar-powered refrigerator hubs.',
        technicalSpecs: [
          'Water treatment: 1g Potassium Permanganate (KMnO4) per 100 liters of drinking water for cattle/sheep',
          'Vaccine temperature tolerance: Maintain Foot-and-Mouth Disease (FMD) and Anthrax vaccines strictly at 2°C to 8°C'
        ],
        equipmentNeeded: ['Ice packs & Cold-chain carrier boxes', 'Potassium Permanganate crystals', 'Water storage barrels'],
      },
      {
        stepNumber: '2.2',
        title: 'Rumen Acidosis & Mastitis Emergency Interventions',
        phase: 'during-event',
        timeline: 'T+12h to T+48h',
        leadAgency: 'Upazila Veterinary Hospital (UVH) Officers',
        triggerThreshold: 'Animals ingesting moldy straw or standing in stagnant contaminated water.',
        detailedProtocol: 'Administer sodium bicarbonate (Baking Soda) drench to ruminants exhibiting rumen impaction or acidosis. Apply teat dip antiseptics (povidone-iodine 1%) to lactating cows twice daily.',
        technicalSpecs: [
          'Oral drench: 50-100g Sodium Bicarbonate in 1 liter clean warm water per adult cattle',
          'Topical antiseptic: 1% Povidone-Iodine dip after milking'
        ],
        equipmentNeeded: ['Drenching bottles', 'Teat dip cups', 'Povidone-Iodine solution'],
      },
      {
        stepNumber: '3.1',
        title: 'Post-Disaster Mass Vaccination Campaign (Anthrax, BQ, FMD & PPR)',
        phase: 'post-disaster',
        timeline: 'T+3d to T+21d',
        leadAgency: 'DLS Mass Immunization Cell & District Livestock Officer',
        triggerThreshold: 'Floodwaters receding, exposing spore-contaminated soil and wet mud.',
        detailedProtocol: 'Deploy mobile veterinary medical teams across all affected unions to conduct ring-vaccination for cattle against Anthrax and Black Quarter, and Peste des Petits Ruminants (PPR) for goats/sheep.',
        technicalSpecs: [
          'Anthrax Spore Vaccine: 1 ml subcutaneous (SC) injection per adult bovine (immunity for 1 year)',
          'FMD Trivalent Vaccine: 2 ml intramuscular (IM) per cattle; 1 ml IM for sheep/goats',
          'PPR Vaccine: 1 ml SC for goats and sheep older than 4 months'
        ],
        equipmentNeeded: ['Automatic continuous syringes', 'Sterile needles (16G/18G)', 'Antiseptic spirit'],
        criticalWarning: 'Never slaughter or open the carcass of any animal suspected of dying from Anthrax due to extreme zoonotic spore transmission.'
      },
      {
        stepNumber: '3.2',
        title: 'Biosecure Carcass Disposal Protocol (Limed Deep Pit Burial)',
        phase: 'post-disaster',
        timeline: 'T+1d to T+7d',
        leadAgency: 'Union Parishad Sanitation Team & DLS Field Staff',
        triggerThreshold: 'Animal mortality occurring during storm surge, flood, or lightning strike.',
        detailedProtocol: 'Excavate burial pits at least 2.0 meters deep located at least 50 meters away from any groundwater well or riverbank. Lay carcasses in the pit, cover entirely with 10-15 kg of Quicklime (Calcium Oxide - CaO) or Bleaching Powder before backfilling with compacted soil.',
        technicalSpecs: [
          'Burial pit depth: Minimum 2.0m depth, with at least 1.2m of compacted topsoil over carcass',
          'Disinfectant dosage: 10 kg Quicklime (CaO) per large cattle carcass (500 kg biomass)'
        ],
        equipmentNeeded: ['Excavators / Shovels', 'Quicklime (Calcium Oxide)', 'Heavy rubber gloves and PPE'],
      }
    ],
    technicalSpecs: [
      {
        name: 'Anthrax Spore Vaccine (DLS Produced)',
        category: 'Veterinary Biologic',
        toleranceLevel: 'Zoonotic spore-forming Bacillus anthracis prevention',
        recommendedDosage: '1.0 ml Subcutaneously (Neck region) for cattle/buffalo',
        targetCondition: 'Post-flood mud exposure in riverine charlands and lowlands',
        notes: 'Mandatory annual vaccination before monsoon onset.'
      },
      {
        name: 'Urea-Molasses-Straw (UMS) Block',
        category: 'Emergency Nutrition',
        toleranceLevel: 'Maintains ruminant nitrogen balance during green fodder shortages',
        recommendedDosage: '3-4 kg per adult cow/day supplemented with 1 kg wheat bran',
        targetCondition: 'Prolonged flood submergence of grazing pastures',
        notes: 'BLRI tested formula; increases crude protein intake from 3% to 9% in dry straw.'
      },
      {
        name: 'PPR Vaccine (Lyophilized)',
        category: 'Caprine/Ovine Vaccine',
        toleranceLevel: 'Peste des Petits Ruminants viral prevention in goats & sheep',
        recommendedDosage: '1.0 ml Subcutaneously for animals > 4 months age',
        targetCondition: 'High humidity, post-cyclone respiratory and gastrointestinal stress',
        notes: 'Reconstitute only with sterile diluent; use within 2 hours of reconstitution.'
      },
      {
        name: 'Broad-Spectrum Anthelmintic (Triclabendazole + Levamisole)',
        category: 'Veterinary Parasiticide',
        toleranceLevel: 'Liver fluke (Fasciola gigantica) & gastrointestinal roundworms',
        recommendedDosage: '1 bolus per 100-150 kg body weight orally after food intake',
        targetCondition: 'Waterlogged snail-infested pastures after flood recession',
        notes: 'Treat all surviving ruminants within 14 days post-flood to prevent parasitic anaemia.'
      }
    ],
    officialDocumentation: [
      {
        title: 'Department of Livestock Services (DLS) Central Portal',
        issuingBody: 'Department of Livestock Services (DLS)',
        docType: 'Official Portal',
        url: 'https://dls.gov.bd/',
        description: 'National livestock census, emergency veterinary clinic directories, epidemic surveillance alerts, and medicine procurement manuals.'
      },
      {
        title: 'Bangladesh Livestock Research Institute (BLRI) Tech Hub',
        issuingBody: 'Bangladesh Livestock Research Institute (BLRI)',
        docType: 'Research Bulletin',
        url: 'https://blri.gov.bd/',
        description: 'Scientific publications on disaster-resilient livestock breeds (e.g. Red Chittagong Cattle, Black Bengal Goat) and silage processing.'
      },
      {
        title: 'Emergency Management Guidelines for Animal Health - FAO',
        issuingBody: 'Food and Agriculture Organization (FAO / WOAH)',
        docType: 'WHO/UN Guideline',
        url: 'https://www.fao.org/animal-health/en',
        description: 'International standards for veterinary emergency response, disease containment, and animal welfare during natural disasters.'
      },
      {
        title: 'National Disaster Management Framework for Livestock - MoFL',
        issuingBody: 'Ministry of Fisheries and Livestock',
        docType: 'National Gazette',
        url: 'https://mofl.gov.bd/',
        description: 'Statutory emergency powers and budgetary allocation mechanisms for veterinary medicine stockpiles.'
      }
    ],
    emergencyContacts: [
      {
        agencyName: 'Department of Livestock Services (DLS)',
        departmentOrCell: 'Central Disaster Monitoring & Epidemic Control Room',
        roleOrDesignation: 'Director (Animal Health) / Disaster Focal Officer',
        hotline: '16358 (Pranisampad Call Center)',
        landline: '+88-02-9101932',
        officialEmail: 'dls_controlroom@yahoo.com',
        address: 'Krishi Khamar Sarak, Farmgate, Dhaka-1215, Bangladesh',
        scope: 'Government of Bangladesh'
      },
      {
        agencyName: 'Bangladesh Livestock Research Institute (BLRI)',
        departmentOrCell: 'Socio-Economic & Disaster Response Cell',
        roleOrDesignation: 'Director General & Chief Veterinary Officer',
        hotline: '+88-02-7791670',
        officialEmail: 'dgblri@gmail.com',
        address: 'Savar, Dhaka-1341, Bangladesh',
        scope: 'Government of Bangladesh'
      },
      {
        agencyName: 'World Organisation for Animal Health (WOAH / FAO-ECTAD)',
        departmentOrCell: 'Emergency Centre for Transboundary Animal Diseases (ECTAD)',
        roleOrDesignation: 'Team Leader - Animal Health Emergency',
        hotline: '+88-02-58153800',
        officialEmail: 'ECTAD-BD@fao.org',
        address: 'DLS Compound, Khamarbari, Farmgate, Dhaka-1215',
        scope: 'International Humanitarian Agency'
      }
    ],
    emailTemplate: {
      subject: '[EMERGENCY-LIVESTOCK] Immediate Veterinary Vaccine, Fodder & Medical Team Requisition - District: [DISTRICT_NAME]',
      recipientDefault: 'dls_controlroom@yahoo.com, dg@dls.gov.bd, ECTAD-BD@fao.org',
      bodyStructure: `To:
Director (Animal Health), Department of Livestock Services (dls_controlroom@yahoo.com)
Director General, DLS (dg@dls.gov.bd)
Team Leader, FAO-ECTAD Bangladesh (ECTAD-BD@fao.org)

Subject: [EMERGENCY-LIVESTOCK] Immediate Veterinary Vaccine, Fodder & Medical Team Requisition - District: [DISTRICT_NAME]

Dear Sir/Madam,

This is an urgent operational request from the District Disaster Management Committee for [DISTRICT_NAME], reporting critical livestock distress across [UPAZILAS_AFFECTED] due to [HAZARD_TYPE: Cyclone Surge/Severe Inundation].

1. LIVESTOCK CENSUS AT SEVERE RISK:
- Bovine (Cattle/Buffalo): [CATTLE_COUNT] head
- Small Ruminants (Goat/Sheep): [GOAT_COUNT] head
- Poultry / Duck Stock: [POULTRY_COUNT] birds
- Reported Mortalities to date: [MORTALITY_COUNT] head

2. EMERGENCY VETERINARY SUPPLIES REQUISITION:
- Emergency Anthrax Spore Vaccine: [ANTHRAX_DOSES] doses
- FMD Trivalent Vaccine: [FMD_DOSES] doses
- PPR Vaccine for Goats: [PPR_DOSES] doses
- Emergency Urea-Molasses-Straw (UMS) & Dry Fodder: [FODDER_METRIC_TONS] MT
- Broad-Spectrum Anthelmintics (Triclabendazole bolus): [BOLUS_COUNT] packs
- Quicklime (CaO) for biosecure carcass burial: [LIME_KG] kg

3. STAGING POINT & VETERINARY CONTACT:
- District Livestock Officer (DLO): [DLO_NAME]
- Mobile / Emergency Line: [DLO_PHONE]
- Staging Veterinary Depot: [DEPOT_LOCATION]

We urge immediate deployment of the Mobile Veterinary Clinics and air/boat-drop fodder delivery to isolated char communities.

Sincerely,
[YOUR_NAME_AND_DESIGNATION]
[DISTRICT/UPAZILA DISASTER COMMITTEE]
Contact: [PHONE_NUMBER]`
    }
  },

  fisheries: {
    id: 'fisheries',
    name: 'Fisheries & Aquaculture',
    fullTitle: 'DoF / BFRI Aquaculture Protection, Inundation Netting & Broodstock Management',
    code: 'FISH-SOP',
    iconName: 'water_drop',
    themeColor: 'cyan',
    badge: 'National Fisheries Directive (DoF/BFRI 2026)',
    leadAuthorities: [
      'Department of Fisheries (DoF)',
      'Bangladesh Fisheries Research Institute (BFRI)',
      'Ministry of Fisheries and Livestock (MoFL)'
    ],
    sodReference: 'Standing Orders on Disaster (SOD 2019) Clause 4.3.3 (Fisheries & Aquaculture)',
    executiveSummary: 'Protocols for perimeter net reinforcement around commercial carp and shrimp gher ponds, emergency oxygenation, disease prophylaxis (EUS / bacterial fin rot), and post-flood pond rehabilitation.',
    hazardVulnerabilitySummary: 'Severe fish washout during flash floods in Mymensingh, Netrokona, and Sunamganj; salinity shock and coastal pond dyke erosion in Satkhira, Khulna, and Bagerhat shrimp ghers.',
    phasedProtocols: [
      {
        stepNumber: '1.1',
        title: 'Perimeter Net Enclosure & Pond Dyke Elevation (Nylon Mesh Installation)',
        phase: 'pre-disaster',
        timeline: 'T-72h to T-24h',
        leadAgency: 'DoF Upazila Fisheries Office & Local Fish Farmer Associations',
        triggerThreshold: 'Pond water level within 0.5m of embankment top with forecasted continuous torrential rainfall.',
        detailedProtocol: 'Erect 1.0m to 1.5m high heavy-duty nylon perimeter netting (mesh size 0.5 to 1.0 inch) around all culture ponds. Secure netting to sturdy bamboo poles driven at 1.5m intervals and bury the bottom net edge 15 cm into the earth dyke to prevent fish escape.',
        technicalSpecs: [
          'Net specification: Polyethylene knotted twine netting (minimum 210D/12 ply)',
          'Bamboo pole anchor: Treated bamboo stakes driven 50 cm into dyke shoulder'
        ],
        equipmentNeeded: ['High-tensile nylon netting', 'Bamboo poles', 'Earth staples / Wire fasteners'],
        criticalWarning: 'Ensure the bottom edge of the net is firmly buried; fish will swim underneath loose nets during overtopping.'
      },
      {
        stepNumber: '1.2',
        title: 'Emergency Selective Harvesting & Broodstock Relocation',
        phase: 'pre-disaster',
        timeline: 'T-48h to T-12h',
        leadAgency: 'BFRI Hatchery Division & DoF Extension',
        triggerThreshold: 'Probability of catastrophic pond inundation exceeding 80%.',
        detailedProtocol: 'Perform urgent partial drag-net harvesting of all marketable size fish (Rui, Katla, Mrigal, Tilapia, Pangas >500g). Transfer valuable genetic broodstock to secure concrete indoor hatchery cisterns or elevated tanks with aeration.',
        technicalSpecs: [
          'Selective harvest target: Clear at least 60% of total biomass to minimize financial loss',
          'Broodstock transport density: Maximum 50 kg live fish per 1000L oxygenated transport tank'
        ],
        equipmentNeeded: ['Seine nets (Ber Jal)', 'Live fish transport tanks with O2 cylinders', 'Weighing scales'],
      },
      {
        stepNumber: '2.1',
        title: 'Emergency Aeration & Dissolved Oxygen (DO) Preservation',
        phase: 'during-event',
        timeline: 'T-0 to T+48h',
        leadAgency: 'Aquaculture Cluster Emergency Unit',
        triggerThreshold: 'Pond dissolved oxygen dropping below 3.0 mg/L due to organic runoff and lack of sunlight.',
        detailedProtocol: 'Operate mechanical paddlewheel aerators or diesel water pumps continuously to agitate the water surface. If electrical grid is offline, manually apply chemical oxygen generators (Sodium Percarbonate / Tablet Oxygen) across the pond surface.',
        technicalSpecs: [
          'Chemical Oxygen dosage: 10-15g Sodium Percarbonate (Oxy-Plus/Bio-Ox) per decimal per foot depth',
          'Target DO level: Maintain dissolved oxygen strictly above 4.5 ppm'
        ],
        equipmentNeeded: ['Paddlewheel aerators', 'Sodium Percarbonate granules', 'Digital DO meters'],
      },
      {
        stepNumber: '2.2',
        title: 'Pond Water Acidity & Turbidity Control (Emergency Liming)',
        phase: 'during-event',
        timeline: 'T+12h to T+48h',
        leadAgency: 'Upazila Senior Fisheries Officer (SFO)',
        triggerThreshold: 'Rainfall runoff causing pH drop below 6.5 or excessive suspended mud silt.',
        detailedProtocol: 'Broadcast agricultural limestone (Calcium Carbonate - CaCO3) or slaked lime (Calcium Hydroxide - Ca(OH)2) dissolved in water to buffer pH swings and flocculate suspended colloidal clay particles.',
        technicalSpecs: [
          'Limestone dosage: 1.0 to 1.5 kg Calcium Carbonate (CaCO3) per decimal (40.46 m²)',
          'pH stabilization target: Keep pond water pH stabilized between 7.5 and 8.3'
        ],
        equipmentNeeded: ['Agricultural Lime (CaCO3)', 'Plastic dissolution drums', 'pH test meters/strips'],
      },
      {
        stepNumber: '3.1',
        title: 'Post-Flood Parasite & Bacterial Prophylaxis (EUS Prevention)',
        phase: 'post-disaster',
        timeline: 'T+3d to T+14d',
        leadAgency: 'BFRI Fish Health Protection Division & DoF Extension',
        triggerThreshold: 'Flood recession accompanied by temperature drops or sudden salinity changes.',
        detailedProtocol: 'Treat entire pond volume with Potassium Permanganate (KMnO4) or CIFAX solution to eradicate pathogenic fungi (Aphanomyces invadans) responsible for Epizootic Ulcerative Syndrome (EUS) and bacterial fin rot.',
        technicalSpecs: [
          'Potassium Permanganate treatment: 1.0 - 2.0 ppm (40-80g KMnO4 per decimal for 3-foot depth)',
          'Salt bath for surviving broodstock: 2-3% NaCl dip for 60 seconds before returning to quarantine ponds'
        ],
        equipmentNeeded: ['Potassium Permanganate (KMnO4)', 'CIFAX solution', 'Submersible sampling nets'],
      },
      {
        stepNumber: '3.2',
        title: 'Pond De-Silting & Fast-Growing Fingerling Re-Stocking Support',
        phase: 'post-disaster',
        timeline: 'T+14d to T+30d',
        leadAgency: 'DoF Government Hatchery Network',
        triggerThreshold: 'Pond rehabilitation after complete flood desolation.',
        detailedProtocol: 'Pump out excessive mud silt, disinfect with quicklime (2.0 kg/decimal), apply fermented organic manure to generate natural plankton bloom, and re-stock with fast-growing certified fingerlings (Silver Carp, Shing, Magur, Monosex Tilapia).',
        technicalSpecs: [
          'Stocking density: 60-80 fingerlings (size 7-10 cm) per decimal',
          'Plankton generation: 5 kg cowdung + 100g Urea + 100g TSP per decimal fermented for 3 days'
        ],
        equipmentNeeded: ['Dewatering mud pumps', 'Certified government hatchery fingerlings'],
      }
    ],
    technicalSpecs: [
      {
        name: 'Agricultural Lime (Calcium Carbonate - CaCO3)',
        category: 'Water Quality Conditioner',
        toleranceLevel: 'Neutralizes acidic storm runoff and buffers alkalinity',
        recommendedDosage: '1.0 - 2.0 kg per decimal (40.46 m²) for standard 3-ft water depth',
        targetCondition: 'Post-heavy rainfall pH drops and high water turbidity',
        notes: 'Dissolve in water in a plastic barrel, cool down, and broadcast evenly across surface.'
      },
      {
        name: 'Sodium Percarbonate (Oxy-Tablet / Bio-Ox)',
        category: 'Emergency Chemical Aerator',
        toleranceLevel: 'Rapidly releases active oxygen in hypoxic pond layers',
        recommendedDosage: '15-20 grams per decimal in stagnant or cloudy weather',
        targetCondition: 'Early morning DO depletion (< 3.0 mg/L) when fish surface for air',
        notes: 'Sinks to bottom to oxygenate benthic decomposition layer directly.'
      },
      {
        name: 'Potassium Permanganate (KMnO4)',
        category: 'Broad-Spectrum Disinfectant',
        toleranceLevel: 'Bactericidal & fungicidal agent against EUS and Columnaris',
        recommendedDosage: '1.5 - 2.0 ppm (approx 60-80g per decimal-foot)',
        targetCondition: 'Post-flood wound infections and skin ulcerations on carp/catfish',
        notes: 'Apply on sunny mornings; avoid overdosing in alkaline water (pH > 8.5).'
      },
      {
        name: 'BFRI Shing-2 / Monosex Tilapia Fingerlings',
        category: 'Fast-Growing Re-stocking Strain',
        toleranceLevel: 'High density, low oxygen, and turbid water resilience',
        recommendedDosage: 'Stocking rate: 150-200 fingerlings/decimal for semi-intensive culture',
        targetCondition: 'Rapid post-disaster livelihood restoration within 90-120 days',
        notes: 'Reaches harvestable size (100-120g for Shing) with high market value.'
      }
    ],
    officialDocumentation: [
      {
        title: 'Department of Fisheries (DoF) National Portal',
        issuingBody: 'Department of Fisheries (DoF)',
        docType: 'Official Portal',
        url: 'https://fisheries.gov.bd/',
        description: 'Comprehensive directory of district fisheries officers, aquaculture licenses, disaster rehabilitation schemes, and hatchery registries.'
      },
      {
        title: 'Bangladesh Fisheries Research Institute (BFRI) Research Hub',
        issuingBody: 'Bangladesh Fisheries Research Institute (BFRI)',
        docType: 'Research Bulletin',
        url: 'https://bfri.gov.bd/',
        description: 'Scientific manuals on indigenous fish breeding (Shing, Magur, Gulsha, Pabda), shrimp health management, and disease diagnostic guides.'
      },
      {
        title: 'Code of Conduct for Responsible Fisheries - FAO',
        issuingBody: 'Food and Agriculture Organization (FAO)',
        docType: 'WHO/UN Guideline',
        url: 'https://www.fao.org/fishery/en',
        description: 'Global standards for sustainable aquaculture resilience, environmental mitigation, and small-scale fish farming protection.'
      },
      {
        title: 'National Fisheries Policy & Disaster Contingency Guidelines',
        issuingBody: 'Ministry of Fisheries and Livestock',
        docType: 'National Gazette',
        url: 'https://mofl.gov.bd/',
        description: 'Official regulations regarding coastal shrimp embankment maintenance and government relief compensations.'
      }
    ],
    emergencyContacts: [
      {
        agencyName: 'Department of Fisheries (DoF)',
        departmentOrCell: 'Central Aquaculture Disaster Monitoring Cell',
        roleOrDesignation: 'Director General & Director (Aquaculture)',
        hotline: '+88-02-9561355',
        landline: '+88-02-9561707',
        officialEmail: 'dg@fisheries.gov.bd',
        address: 'Matsya Bhaban, 1 Park Avenue, Ramna, Dhaka-1000, Bangladesh',
        scope: 'Government of Bangladesh'
      },
      {
        agencyName: 'Bangladesh Fisheries Research Institute (BFRI)',
        departmentOrCell: 'Fish Disease Diagnostic & Emergency Research Unit',
        roleOrDesignation: 'Director General & Chief Scientific Officer',
        hotline: '+88-091-65874',
        officialEmail: 'dgbfri@gmail.com',
        address: 'BFRI Headquarters, Mymensingh-2201, Bangladesh',
        scope: 'Government of Bangladesh'
      },
      {
        agencyName: 'WorldFish Bangladesh & South Asia Office',
        departmentOrCell: 'Emergency Sustainable Aquaculture Program',
        roleOrDesignation: 'Country Representative & Disaster Resilience Lead',
        hotline: '+88-02-58814717',
        officialEmail: 'worldfish-bangladesh@cgiar.org',
        address: 'House 22B, Road 7, Block F, Banani, Dhaka-1213',
        scope: 'International Humanitarian Agency'
      }
    ],
    emailTemplate: {
      subject: '[EMERGENCY-FISHERIES] Requisition for Aquaculture Rescue, Fingerling Supply & Lime Assistance - District: [DISTRICT_NAME]',
      recipientDefault: 'dg@fisheries.gov.bd, dgbfri@gmail.com, worldfish-bangladesh@cgiar.org',
      bodyStructure: `To:
Director General, Department of Fisheries (dg@fisheries.gov.bd)
Director General, BFRI (dgbfri@gmail.com)
Country Representative, WorldFish Bangladesh (worldfish-bangladesh@cgiar.org)

Subject: [EMERGENCY-FISHERIES] Requisition for Aquaculture Rescue, Fingerling Supply & Lime Assistance - District: [DISTRICT_NAME]

Dear Sir/Madam,

This emergency transmission informs of severe inundation and dyke breach of aquaculture ponds in District: [DISTRICT_NAME], Upazila(s): [UPAZILAS_AFFECTED] resulting from [HAZARD_TYPE: Flash Flood/Monsoon Inundation/Cyclone Surge].

1. AQUACULTURE LOSS & IMPACT DATA:
- Flooded Commercial Fish Ponds / Shrimp Ghers: [PONDS_COUNT] units
- Submerged Culture Area: [TOTAL_AREA_HECTARES] Ha
- Estimated Escaped Fish/Shrimp Biomass: [BIOMASS_METRIC_TONS] MT
- Total Affected Fish Farmers: [FARMERS_COUNT]

2. IMMEDIATE REHABILITATION REQUISITIONS:
- Emergency Heavy-Duty Nylon Netting (210D/12-ply): [NET_METERS] linear meters
- Agricultural Lime (CaCO3) for Water Purification: [LIME_MT] Metric Tons
- Chemical Oxygen Tablets (Sodium Percarbonate): [OXY_KG] kg
- Subsidized Fast-Growing Fingerlings (Rui, Mrigal, Tilapia, Shing): [FINGERLING_COUNT] pieces

3. DISTRICT FISHERIES DESK COORDINATOR:
- District Fisheries Officer (DFO): [DFO_NAME]
- Hotline / Cell: [DFO_PHONE]
- Primary Logistics Point: [LOGISTICS_HUB]

We request urgent sanction of the Disaster Relief Fingerling Incentive Fund for rapid restocking.

Sincerely,
[YOUR_NAME_AND_DESIGNATION]
[DISTRICT/UPAZILA FISHERIES DISASTER COMMITTEE]
Contact: [PHONE_NUMBER]`
    }
  },

  'health-wash': {
    id: 'health-wash',
    name: 'Public Health, WASH & Epidemics',
    fullTitle: 'WHO / UNICEF / DGHS / DPHE Water, Sanitation, Hygiene & Epidemic Containment Protocols',
    code: 'WASH-SOP',
    iconName: 'medical_services',
    themeColor: 'rose',
    badge: 'National WASH Standard (DGHS/DPHE/WHO 2026)',
    leadAuthorities: [
      'Directorate General of Health Services (DGHS)',
      'Department of Public Health Engineering (DPHE)',
      'Institute of Epidemiology, Disease Control and Research (IEDCR)',
      'World Health Organization (WHO)',
      'UNICEF Bangladesh'
    ],
    sodReference: 'Standing Orders on Disaster (SOD 2019) Clause 4.4.1 (Health & Public Safety)',
    executiveSummary: 'Mandatory technical standard operating procedures for safe drinking water staging, tube-well shock-chlorination, Oral Rehydration Salt (ORS) distribution, waterborne disease (Cholera, Acute Watery Diarrhea, Typhoid) outbreak containment, and snakebite antivenom management.',
    hazardVulnerabilitySummary: 'Severe contamination of shallow groundwater tube-wells during flooding, high risk of acute watery diarrhea (AWD) in displacement shelters, and spike in venomous snakebites (Russell\'s Viper, Cobra, Krait) during monsoon inundations.',
    phasedProtocols: [
      {
        stepNumber: '1.1',
        title: 'Emergency Safe Water Point Staging & Tube-Well Sealing',
        phase: 'pre-disaster',
        timeline: 'T-72h to T-24h',
        leadAgency: 'DPHE Upazila Office & Union WASH Committees',
        triggerThreshold: 'Predicted flood inundation exceeding platform level of community hand tube-wells.',
        detailedProtocol: 'Raise tube-well pump heads above high flood level (HFL) using pipe extensions. For vulnerable shallow tube-wells, tightly seal the top cylinder joint with rubber gaskets and plastic wrapping to prevent surface floodwater contamination from entering the aquifer.',
        technicalSpecs: [
          'Tube-well platform elevation: Raise minimum 0.6m above historical highest flood level (HFL)',
          'Gasket specification: Food-grade EPDM rubber seals around casing joint'
        ],
        equipmentNeeded: ['Hand tube-well pipe extensions', 'Rubber sealing gaskets', 'Pipe wrenches'],
        criticalWarning: 'Never drink directly from submerged tube-wells without mandatory chlorination or boiling.'
      },
      {
        stepNumber: '1.2',
        title: 'Emergency Medical & WASH Stockpiling at Cyclone / Flood Shelters',
        phase: 'pre-disaster',
        timeline: 'T-48h to T-12h',
        leadAgency: 'DGHS Civil Surgeon Office & Upazila Health Complex (UHC)',
        triggerThreshold: 'Official evacuation order issued by District Administration.',
        detailedProtocol: 'Pre-position Water Purification Tablets (Halazone / Aquatabs), Oral Rehydration Salts (ORS packets), IV fluids (Cholera Saline - Ringer\'s Lactate), water testing kits, and Polyvalent Snake Antivenom vials in every designated shelter.',
        technicalSpecs: [
          'Per shelter stockpile standard: 10,000 Aquatabs (67mg) + 2,000 ORS sachets + 100 liters IV Ringer\'s Lactate per 1,000 evacuees',
          'Antivenom reserve: Minimum 20 vials of Lyophilized Polyvalent Snake Antivenom at each Upazila Health Complex'
        ],
        equipmentNeeded: ['Aquatabs (Sodium Dichloroisocyanurate)', 'ORS sachets', 'IV infusion sets', 'Polyvalent Antivenom'],
      },
      {
        stepNumber: '2.1',
        title: 'Point-of-Use Water Disinfection & Mobile Water Treatment Plant (WTP) Operation',
        phase: 'during-event',
        timeline: 'T-0 to T+48h',
        leadAgency: 'DPHE Emergency Response Unit & BDRCS Water Team',
        triggerThreshold: 'Municipal water supply or rural tube-wells submerged and inoperable.',
        detailedProtocol: 'Deploy truck-mounted and boat-mounted mobile water treatment plants (WTPs) to produce 2,000 to 5,000 liters/hour of safe drinking water. Distribute Aquatabs with strict instructions: 1 tablet (67mg NaDCC) per 20 liters of clear water, wait 30 minutes before drinking.',
        technicalSpecs: [
          'Aquatabs dosage: 1 tablet (67mg NaDCC) per 20 Liters of water (provides 2.5 mg/L free available chlorine)',
          'Turbid water protocol: Flocculate with Alum (Phitkari 1g/10L) before adding chlorination tablets',
          'Free residual chlorine target: Maintain 0.5 to 1.0 mg/L at delivery point'
        ],
        equipmentNeeded: ['Mobile Water Treatment Plants (WTP)', 'Aquatabs', 'Potable water bladder tanks (5,000L)'],
      },
      {
        stepNumber: '2.2',
        title: 'Acute Watery Diarrhea (AWD) & Cholera Early Detection & Isolation',
        phase: 'during-event',
        timeline: 'T+6h to T+48h',
        leadAgency: 'DGHS Health Emergency Operation Center (HEOC) & IEDCR',
        triggerThreshold: 'Cluster of 3 or more patients with severe watery diarrhea within a single village or shelter.',
        detailedProtocol: 'Isolate patients in dedicated Diarrhea Treatment Units (DTUs). Immediately administer Plan B/C rehydration protocol using ORS and IV Ringer\'s Lactate. Collect stool samples via Cary-Blair transport medium for rapid laboratory cholera testing.',
        technicalSpecs: [
          'Severe dehydration protocol: 100 ml/kg Ringer\'s Lactate IV within 3 hours (adults) or 6 hours (infants)',
          'Antibiotic treatment (severe cases only): Azithromycin (20 mg/kg single oral dose) or Doxycycline (300 mg single dose)'
        ],
        equipmentNeeded: ['Cholera cots with collection buckets', 'Cary-Blair transport media', 'IV infusion stands'],
      },
      {
        stepNumber: '3.1',
        title: 'Shock-Chlorination of Inundated Tube-Wells (Bleaching Powder Protocol)',
        phase: 'post-disaster',
        timeline: 'T+3d to T+14d',
        leadAgency: 'DPHE Field Mechanics & Community WASH Volunteers',
        triggerThreshold: 'Floodwaters fully receded from tube-well platforms.',
        detailedProtocol: 'Disinfect all submerged tube-wells using a concentrated Bleaching Powder solution (33% available chlorine). Pour solution directly down the casing, pump until chlorine smell emerges, let stand for 12 hours, then pump to waste until water is completely clear.',
        technicalSpecs: [
          'Bleaching powder dosage: Mix 150 grams of fresh Bleaching Powder (33% chlorine) in 10 liters of clean water per tube-well',
          'Contact time: Minimum 12 hours contact time before pumping out residual chlorine'
        ],
        equipmentNeeded: ['Bleaching Powder (Chlorinated Lime)', 'Plastic buckets & funnels', 'DPHE Residual Chlorine Test Kits'],
        criticalWarning: 'Never drink the shock-chlorinated water during the first 15 minutes of continuous purging.'
      },
      {
        stepNumber: '3.2',
        title: 'Emergency Snakebite Envenomation Management & Rapid Triage',
        phase: 'post-disaster',
        timeline: 'T+1d to T+30d',
        leadAgency: 'DGHS National Snakebite Treatment Center & Upazila Health Complexes',
        triggerThreshold: 'Patient presenting with fang marks, local swelling, neurotoxicity (ptosis), or bleeding.',
        detailedProtocol: 'Immobilize the affected limb using a broad splint and crepe bandage (Pressure Immobilization Technique - DO NOT apply tight arterial tourniquets). Rapidly transfer patient to Upazila Health Complex for 20-minute Whole Blood Clotting Test (20WBCT) and IV Antivenom infusion.',
        technicalSpecs: [
          'Initial Antivenom dosage: 10 vials of Polyvalent Snake Antivenom reconstituted in 500 ml normal saline (0.9% NaCl) infused over 1 hour',
          'Strict prohibition: DO NOT make surgical incisions, suck venom, or apply herbal concoctions'
        ],
        equipmentNeeded: ['Polyvalent Antivenom', 'Clean glass test tubes for 20WBCT', 'Emergency resuscitation kits (Adrenaline/Atropine)'],
      }
    ],
    technicalSpecs: [
      {
        name: 'Aquatabs (NaDCC - 67mg)',
        category: 'Water Disinfectant Tablet',
        toleranceLevel: 'Eliminates 99.9999% bacteria, viruses, and Giardia cysts',
        recommendedDosage: '1 tablet per 20 Liters of clear water; wait 30 minutes before drinking',
        targetCondition: 'Emergency drinking water decontamination during floods/cyclones',
        notes: 'WHO approved; provides 2.5 mg/L free chlorine; non-toxic and stable for 5 years.'
      },
      {
        name: 'Oral Rehydration Salts (WHO-Formula ORS)',
        category: 'Electrolyte Rehydration Formulation',
        toleranceLevel: 'Prevents and treats life-threatening diarrheal dehydration',
        recommendedDosage: '1 packet dissolved completely in exactly 1.0 Liter of safe potable water',
        targetCondition: 'Acute watery diarrhea, cholera, and heat stroke dehydration',
        notes: 'Composition: 2.6g NaCl + 2.9g Trisodium Citrate + 1.5g KCl + 13.5g Glucose.'
      },
      {
        name: 'Bleaching Powder (33% Available Chlorine)',
        category: 'Sanitation & Well Disinfectant',
        toleranceLevel: 'Pathogen eradication in contaminated wells, latrines, and shelters',
        recommendedDosage: '150g per hand tube-well (shock chlorination); 50g/m² for latrine floors',
        targetCondition: 'Post-flood decontamination of water supply infrastructure',
        notes: 'Store in dry airtight drums; decomposes rapidly upon exposure to moisture and sunlight.'
      },
      {
        name: 'Polyvalent Snake Antivenom (Lyophilized)',
        category: 'Critical Antidote Biologic',
        toleranceLevel: 'Neutralizes Cobra, Krait, Russell\'s Viper, and Saw-scaled Viper venoms',
        recommendedDosage: 'Initial loading dose: 10 vials IV infusion in 500 ml Normal Saline over 60 mins',
        targetCondition: 'Systemic envenomation (neurotoxicity, coagulopathy, acute kidney injury)',
        notes: 'Available free of cost at all government Upazila Health Complexes (UHC) and Sadar Hospitals.'
      }
    ],
    officialDocumentation: [
      {
        title: 'DGHS Health Emergency Operation Center & Control Room',
        issuingBody: 'Directorate General of Health Services (DGHS)',
        docType: 'Official Portal',
        url: 'https://dghs.gov.bd/',
        description: 'National daily disease surveillance reports, HEOC emergency hotline network, and hospital bed occupancy trackers.'
      },
      {
        title: 'Department of Public Health Engineering (DPHE) Water Quality Lab',
        issuingBody: 'Department of Public Health Engineering (DPHE)',
        docType: 'Official Portal',
        url: 'https://dphe.gov.bd/',
        description: 'Water quality testing standards, arsenic and salinity mapping, emergency water treatment plant deployment rosters.'
      },
      {
        title: 'WHO Emergency Water, Sanitation and Hygiene (WASH) Guidelines',
        issuingBody: 'World Health Organization (WHO)',
        docType: 'WHO/UN Guideline',
        url: 'https://www.who.int/bangladesh',
        description: 'Technical notes on water quality standards, disease outbreak thresholds, and chlorination dosages during emergencies.'
      },
      {
        title: 'UNICEF Bangladesh Humanitarian Action & WASH Protocols',
        issuingBody: 'UNICEF Bangladesh',
        docType: 'WHO/UN Guideline',
        url: 'https://www.unicef.org/bangladesh/',
        description: 'Protocols on infant nutrition during disasters, hygiene kit standards, and temporary latrine construction guidelines.'
      },
      {
        title: 'National Guideline for Management of Snakebite in Bangladesh',
        issuingBody: 'DGHS / Non-Communicable Disease Control (NCDC)',
        docType: 'Technical Manual',
        url: 'https://dghs.gov.bd/',
        description: 'Official clinical algorithm for diagnosis, antivenom administration, and adverse reaction management.'
      }
    ],
    emergencyContacts: [
      {
        agencyName: 'Directorate General of Health Services (DGHS)',
        departmentOrCell: 'Health Emergency Operation Center (HEOC) & Control Room',
        roleOrDesignation: 'Director (Disease Control) & HEOC In-Charge',
        hotline: '16263 (Shasthya Batayan - 24/7 Toll Free)',
        landline: '+88-02-9855933',
        officialEmail: 'heoc@dghs.gov.bd',
        address: 'Mohakhali, Dhaka-1212, Bangladesh',
        scope: 'Government of Bangladesh'
      },
      {
        agencyName: 'Department of Public Health Engineering (DPHE)',
        departmentOrCell: 'Emergency Water Supply & Sanitation Monitoring Cell',
        roleOrDesignation: 'Chief Engineer & Focal Officer (WASH in Disaster)',
        hotline: '+88-02-9559441',
        officialEmail: 'ce@dphe.gov.bd',
        address: 'DPHE Bhaban, 14 Shaheed Captain Mansur Ali Sarani, Kakrail, Dhaka-1000',
        scope: 'Government of Bangladesh'
      },
      {
        agencyName: 'World Health Organization (WHO) Bangladesh',
        departmentOrCell: 'Health Emergencies Programme (WHE)',
        roleOrDesignation: 'WHE Team Lead & Incident Manager',
        hotline: '+88-02-8831415',
        officialEmail: 'whobangladesh@who.int',
        address: 'United Nations Offices, BSL Office Complex, 1 Minto Road, Dhaka-1000',
        scope: 'International Humanitarian Agency'
      },
      {
        agencyName: 'UNICEF Bangladesh',
        departmentOrCell: 'WASH Section & Emergency Humanitarian Cluster Lead',
        roleOrDesignation: 'Chief of WASH / Emergency Officer',
        hotline: '+88-02-55668088',
        officialEmail: 'dhaka@unicef.org',
        address: 'UNICEF Bhaban, Plot E-30, Syed Mahbub Morshed Avenue, Sher-e-Bangla Nagar, Dhaka-1207',
        scope: 'International Humanitarian Agency'
      }
    ],
    emailTemplate: {
      subject: '[EMERGENCY-HEALTH-WASH] Critical Requisition for Water Purification, Cholera Saline & Antivenom - District: [DISTRICT_NAME]',
      recipientDefault: 'heoc@dghs.gov.bd, ce@dphe.gov.bd, whobangladesh@who.int, dhaka@unicef.org',
      bodyStructure: `To:
In-Charge, Health Emergency Operation Center, DGHS (heoc@dghs.gov.bd)
Chief Engineer, DPHE (ce@dphe.gov.bd)
WHE Team Lead, WHO Bangladesh (whobangladesh@who.int)
Chief of WASH, UNICEF Bangladesh (dhaka@unicef.org)

Subject: [EMERGENCY-HEALTH-WASH] Critical Requisition for Water Purification, Cholera Saline & Antivenom - District: [DISTRICT_NAME]

Dear Sir/Madam,

This urgent emergency notification requests immediate public health and WASH cluster interventions in District: [DISTRICT_NAME], Upazila(s): [UPAZILAS_AFFECTED] facing acute contamination and disease outbreak risks due to [HAZARD_TYPE: Severe Flooding/Cyclone Storm Surge].

1. POPULATION & HEALTH STATUS:
- Total Displaced Population in Shelters: [DISPLACED_POPULATION] people
- Inundated Hand Tube-Wells: [SUBMERGED_TUBEWELLS] units
- Reported Cases of Acute Watery Diarrhea (AWD): [AWD_CASES] cases
- Reported Snakebite Incidents: [SNAKEBITE_CASES] cases

2. CRITICAL EMERGENCY COMMODITY REQUISITIONS:
- Water Purification Tablets (Aquatabs 67mg): [AQUATABS_COUNT] tablets
- WHO-Formula Oral Rehydration Salts (ORS): [ORS_PACKETS] packets
- IV Cholera Saline (Ringer\'s Lactate 1000ml): [IV_BAGS] bags
- Mobile Water Treatment Plants (Truck/Boat mounted): [WTP_COUNT] units
- Polyvalent Snake Antivenom: [ANTIVENOM_VIALS] vials
- Bleaching Powder for Tube-Well Disinfection: [BLEACHING_KG] kg

3. HEALTH EMERGENCY COORDINATOR:
- Civil Surgeon / Upazila Health Officer: [OFFICER_NAME]
- 24/7 Hotline: [OFFICER_PHONE]
- Central Receiving Depot: [HOSPITAL_NAME_AND_ADDRESS]

We urge rapid clearance and immediate transport via military/emergency logistics channels.

Sincerely,
[YOUR_NAME_AND_DESIGNATION]
[DISTRICT HEALTH & DISASTER COMMITTEE]
Contact: [PHONE_NUMBER]`
    }
  },

  'seasonal-calendar': {
    id: 'seasonal-calendar',
    name: 'Agro-Climatic Seasonal Calendar',
    fullTitle: 'BMD / DAE Kharif-I, Kharif-II & Rabi Disaster Scheduling & Cropping Windows',
    code: 'CALENDAR-SOP',
    iconName: 'event_note',
    themeColor: 'indigo',
    badge: 'National Agro-Climatic Framework (BMD/DAE 2026)',
    leadAuthorities: [
      'Bangladesh Meteorological Department (BMD)',
      'Department of Agricultural Extension (DAE)',
      'Flood Forecasting and Warning Centre (FFWC)',
      'Bangladesh Agricultural Research Council (BARC)'
    ],
    sodReference: 'Standing Orders on Disaster (SOD 2019) Clause 4.2.3 (Agrometeorological Early Warning & Calendars)',
    executiveSummary: 'Precision seasonal timeline directives mapping planting, transplanting, fertilizing, and harvesting windows against probabilistic monsoon onset, flash floods, pre-monsoon Nor\'wester (Kalbaishakhi) thunderstorms, and dry season drought cycles.',
    hazardVulnerabilitySummary: 'Boro crop exposure to early April flash floods in northeastern Haors; T. Aman vulnerability to mid-monsoon drought (mid-season dry spell) and late-monsoon inundation; Rabi vegetables/wheat vulnerable to pre-mature heat and cyclone surges.',
    phasedProtocols: [
      {
        stepNumber: '1.1',
        title: 'Kharif-I (Aus & Jute) Pre-Monsoon Kalbaishakhi & Hailstorm Window Alignment',
        phase: 'pre-disaster',
        timeline: 'March 15 to May 15 (Kharif-I Season)',
        leadAgency: 'BMD Agrometeorology Wing & DAE Upazila Offices',
        triggerThreshold: 'Radar convective storm development and high convective available potential energy (CAPE > 2500 J/kg).',
        detailedProtocol: 'Sow short-duration drought and heat-tolerant Aus varieties (BRRI dhan48, BRRI dhan82, BRRI dhan85) with the first pre-monsoon showers. Complete harvesting before heavy monsoon inundation begins in late May.',
        technicalSpecs: [
          'Aus sowing window: Optimal March 20 - April 10; maturity duration 105-115 days',
          'Hailstorm safeguard: Harvest vegetables and fruits (Watermelon, Mango) immediately upon 5-day Nor\'wester squall alert'
        ],
        equipmentNeeded: ['Automatic Weather Station (AWS) data receivers', 'Short-duration certified seed stock'],
      },
      {
        stepNumber: '1.2',
        title: 'Haor Boro Paddy Early Flash Flood Escape Scheduling',
        phase: 'pre-disaster',
        timeline: 'November 15 to April 30 (Boro Season)',
        leadAgency: 'BRRI Regional Station Sylhet/Habiganj & DAE Haor Wing',
        triggerThreshold: 'FFWC Meghalaya/Assam heavy rainfall alerts (> 200 mm in 48h) in early April.',
        detailedProtocol: 'Enforce early transplanting of short-duration Boro rice varieties (BRRI dhan28/88/96/102) by December 20. Stagger nursery seeding into November 01-10 to ensure complete harvest by April 15 before northeastern flash floods surge from upstream hills.',
        technicalSpecs: [
          'Transplanting deadline: Complete by Dec 25 using 30-35 day seedlings',
          'Maturity target: Full grain harvest completion by April 15-20 (140-145 days total field life)'
        ],
        equipmentNeeded: ['Combined Harvesters staged in Haors', 'Mobile mechanical grain driers'],
        criticalWarning: 'Do not cultivate long-duration varieties (e.g. BRRI dhan29 duration 160 days) in deep Haor basin centers.'
      },
      {
        stepNumber: '2.1',
        title: 'Kharif-II (Transplanted Aman) Monsoon Drought & Flood Management Window',
        phase: 'during-event',
        timeline: 'June 15 to November 30 (Kharif-II Season)',
        leadAgency: 'DAE Irrigation Wing & BMD Climate Division',
        triggerThreshold: 'Monsoon break (> 10 consecutive rainless days in July/August) or continuous submergence.',
        detailedProtocol: 'In drought-prone Barind tracts (Rajshahi, Naogaon, Chapai Nawabganj), operate supplementary irrigation using buried pipe systems for T. Aman during booting to flowering stage. In floodplains, transplant submergence-tolerant BRRI dhan51/52.',
        technicalSpecs: [
          'Supplementary irrigation requirement: 5-7 cm standing water during panicle initiation and flowering',
          'Transplanting window for Sub1 rice: July 15 to August 15'
        ],
        equipmentNeeded: ['Deep Tube-Well (DTW) electrification', 'Portable low-lift pumps (LLP)'],
      },
      {
        stepNumber: '2.2',
        title: 'Mid-Season Drainage and Fertilizer Top-Dressing Window',
        phase: 'during-event',
        timeline: '30 to 45 days after transplanting (DAT)',
        leadAgency: 'DAE Field Staff (SAAO)',
        triggerThreshold: 'Clear weather window forecasted by BMD 7-day numerical weather prediction.',
        detailedProtocol: 'Apply second split of Urea (or Urea Super Granule - USG) and Potassium (MoP) strictly when heavy downpours have ceased, ensuring fertilizer is incorporated into reduced soil layer to prevent runoff loss.',
        technicalSpecs: [
          'USG deep placement: Place 2.7g briquette between 4 hills at 7-10 cm depth (saves 30% nitrogen)',
          'Top-dressing timing: Never broadcast granular urea into draining or running water'
        ],
        equipmentNeeded: ['USG applicator / Granular fertilizer dispensers'],
      },
      {
        stepNumber: '3.1',
        title: 'Rabi Season (Winter Crops) Residual Moisture & Cold Wave Protection',
        phase: 'post-disaster',
        timeline: 'October 15 to March 15 (Rabi Season)',
        leadAgency: 'BARI & DAE Horticulture Division',
        triggerThreshold: 'Minimum night temperatures dropping below 10°C (Moderate to Severe Cold Wave) or early fog.',
        detailedProtocol: 'Utilize residual flood silt moisture for zero-tillage relay cropping of Mustard (BARI Sarisha-14/17), Maize, and Pulses (Khesari, Lentil). Protect tomato and potato fields from Late Blight (Phytophthora infestans) during dense fog by spraying Mancozeb/Cymoxanil.',
        technicalSpecs: [
          'Zero-tillage relay sowing: Broadcast seeds 7-10 days before T. Aman harvest into moist soil',
          'Late Blight fungicide: Mancozeb 75% WP @ 2g/Liter water at 7-day intervals during fog'
        ],
        equipmentNeeded: ['Zero-tillage seed drills', 'Knapsack sprayers', 'Protective straw mulch'],
      },
      {
        stepNumber: '3.2',
        title: 'Coastal Salinity Cycle & Summer Boro Cropping Coordination',
        phase: 'post-disaster',
        timeline: 'January 01 to May 15 (Coastal Dry Season)',
        leadAgency: 'Soil Resource Development Institute (SRDI) & BRRI Coastal Regional Station',
        triggerThreshold: 'River water salinity exceeding 4.0 dS/m in coastal canals (February to April).',
        detailedProtocol: 'Trap freshwater in internal polder reservoirs and canals before January 15. Irrigate salt-tolerant rice (BRRI dhan67/73/97) and Sunflower (BARI Surjamukhi-2) with preserved low-salinity water, applying straw mulch to reduce capillary soil evaporation.',
        technicalSpecs: [
          'Irrigation canal salinity threshold: Close intake sluices when external river EC > 4.0 dS/m',
          'Straw mulching thickness: 5-7 cm dry straw layer reduces soil surface salinity accumulation by 40%'
        ],
        equipmentNeeded: ['Soil EC/TDS meters', 'Sluice gate intake loggers', 'Drip irrigation kits'],
      }
    ],
    technicalSpecs: [
      {
        name: 'BRRI dhan88 / BRRI dhan96 (Short-Duration Boro)',
        category: 'Agro-Calendar Rice Variety',
        toleranceLevel: 'Flash flood escape with 140-145 days total maturity duration',
        recommendedDosage: 'Seed rate: 30 kg/ha; Seedbed sowing: Nov 15 - Nov 30',
        targetCondition: 'Northeastern Haor basins (Sylhet, Sunamganj, Kishoreganj, Netrokona)',
        notes: 'Yields 7.0-7.5 t/ha; allows complete harvest 15 days earlier than BRRI dhan28/29.'
      },
      {
        name: 'BARI Sarisha-14 / BARI Sarisha-17',
        category: 'Short-Duration Oilseed Variety',
        toleranceLevel: 'Cold tolerance with rapid 75-80 days crop duration',
        recommendedDosage: 'Seed rate: 7-8 kg/ha; Sowing: Oct 15 - Nov 15',
        targetCondition: 'Fits between T. Aman harvest and Boro transplanting (Relay/Rabi)',
        notes: 'High oil content (42-44%); maximizes farmer cash flow in post-flood winter.'
      },
      {
        name: 'Mancozeb 75% WP (Indofil / Dithane M-45)',
        category: 'Prophylactic Fungicide',
        toleranceLevel: 'Foliar barrier against Late Blight during winter dense fog and cold waves',
        recommendedDosage: '2.0 grams per Liter of water sprayed thoroughly on both leaf surfaces',
        targetCondition: 'Potato, Tomato, and Rabi vegetable fields during cold spells (<12°C)',
        notes: 'Apply preventatively before disease symptoms appear upon BMD fog advisories.'
      },
      {
        name: 'BARI Surjamukhi-2 (Sunflower)',
        category: 'Salinity-Tolerant Cash Crop',
        toleranceLevel: 'Soil salinity tolerance up to 8.0 dS/m with deep taproot system',
        recommendedDosage: 'Seed rate: 8-10 kg/ha; Spacing: 50cm × 25cm',
        targetCondition: 'Coastal fallow lands during Rabi-summer season (Noakhali, Barishal, Khulna)',
        notes: 'Requires only 2-3 light irrigations; superior premium edible oil production.'
      }
    ],
    officialDocumentation: [
      {
        title: 'Bangladesh Meteorological Department (BMD) Agromet Portal',
        issuingBody: 'Bangladesh Meteorological Department (BMD)',
        docType: 'Official Portal',
        url: 'https://bmd.gov.bd/',
        description: 'Official 10-day numerical weather forecasts, radar animations, cyclone tracking bulletins, and Agro-Met bulletins.'
      },
      {
        title: 'Flood Forecasting and Warning Centre (FFWC) Bulletin',
        issuingBody: 'Bangladesh Water Development Board (BWDB)',
        docType: 'Official Portal',
        url: 'http://ffwc.gov.bd/',
        description: 'Daily river stage telemetry, 5-day hydrograph forecasts for 110+ river stations, and monsoon inundation maps.'
      },
      {
        title: 'Bangladesh Agricultural Research Council (BARC) Agro-Ecological Zones (AEZ)',
        issuingBody: 'Bangladesh Agricultural Research Council (BARC)',
        docType: 'Technical Manual',
        url: 'https://barc.gov.bd/',
        description: 'Detailed spatial profiles and soil characteristics for all 30 Agro-Ecological Zones of Bangladesh.'
      },
      {
        title: 'Soil Resource Development Institute (SRDI) Salinity Maps',
        issuingBody: 'Soil Resource Development Institute (SRDI)',
        docType: 'Research Bulletin',
        url: 'https://srdi.gov.bd/',
        description: 'Temporal monitoring of coastal soil and water salinity gradients across southern upazilas.'
      }
    ],
    emergencyContacts: [
      {
        agencyName: 'Bangladesh Meteorological Department (BMD)',
        departmentOrCell: 'Agrometeorology & Storm Warning Center (SWC)',
        roleOrDesignation: 'Director & Duty Meteorologist',
        hotline: '+88-02-8144968',
        landline: '+88-02-48116634',
        officialEmail: 'info@bmd.gov.bd',
        address: 'Meteorological Complex, Agargaon, Dhaka-1207, Bangladesh',
        scope: 'Government of Bangladesh'
      },
      {
        agencyName: 'Flood Forecasting and Warning Centre (FFWC)',
        departmentOrCell: 'Hydrology Division, Bangladesh Water Development Board (BWDB)',
        roleOrDesignation: 'Executive Engineer / Superintending Engineer',
        hotline: '+88-02-9553118',
        landline: '+88-01715040144',
        officialEmail: 'ffwc05@yahoo.com',
        address: 'WAPDA Building (8th Floor), Motijheel C/A, Dhaka-1000, Bangladesh',
        scope: 'Government of Bangladesh'
      },
      {
        agencyName: 'Regional Integrated Multi-Hazard Early Warning System (RIMES)',
        departmentOrCell: 'Bangladesh Country Operations Hub',
        roleOrDesignation: 'Agro-Climate Specialist',
        hotline: '+88-02-8144968',
        officialEmail: 'rimes-bangladesh@rimes.int',
        address: 'BMD Compound, Agargaon, Dhaka-1207',
        scope: 'International Humanitarian Agency'
      }
    ],
    emailTemplate: {
      subject: '[AGROMET-ADVISORY-REQUEST] Request for Specialized Downscaled Weather Forecast & Agro-Calendar Directives - District: [DISTRICT_NAME]',
      recipientDefault: 'info@bmd.gov.bd, ffwc05@yahoo.com, controlroom@dae.gov.bd',
      bodyStructure: `To:
Duty Officer, Storm Warning Center, BMD (info@bmd.gov.bd)
Executive Engineer, FFWC / BWDB (ffwc05@yahoo.com)
Director, Field Services Wing, DAE (controlroom@dae.gov.bd)

Subject: [AGROMET-ADVISORY-REQUEST] Request for Specialized Downscaled Weather Forecast & Agro-Calendar Directives - District: [DISTRICT_NAME]

Dear Sir/Madam,

The District Agrometeorological Advisory Committee of [DISTRICT_NAME] requests a high-resolution, downscaled 10-day meteorological & hydrological forecast to adjust seasonal cropping and harvesting timelines for [CROP_NAME: e.g. Boro Paddy / T. Aman / Rabi Mustard].

1. LOCAL AGRO-CLIMATIC CONTEXT:
- Agro-Ecological Zone: [AEZ_NAME]
- Dominant Cropping Pattern: [CROPPING_PATTERN: e.g. Boro-Fallow-T.Aman]
- Current Phenological Stage: [STAGE: Sowing/Booting/Ripening]
- Target Harvest/Transplant Date: [DATE]

2. SPECIFIC METEOROLOGICAL TELEMETRY REQUESTED:
- Probabilistic 7-Day Rainfall Accumulation (mm) & Onset
- River Stage Forecast & Danger Level Exceedance Probability at nearest gauge station: [STATION_NAME]
- Maximum / Minimum Temperature anomalies and Cold/Heat wave duration
- 10-Meter Wind Speed & Gust Projections for pesticide/fertilizer scheduling

3. LEAD EXTENSION AGENT:
- Deputy Director, DAE [DISTRICT_NAME]: [DD_NAME]
- Contact Mobile / Email: [PHONE_EMAIL]

Sincerely,
[YOUR_NAME_AND_DESIGNATION]
[DISTRICT AGROMETEOROLOGICAL COMMITTEE]
Contact: [PHONE_NUMBER]`
    }
  },

  'emergency-response': {
    id: 'emergency-response',
    name: 'Disaster Management & Evacuation',
    fullTitle: 'MoDMR / DDM / CPP / BDRCS Incident Command, Warning Signals & Evacuation Logistics',
    code: 'DISASTER-SOP',
    iconName: 'warning',
    themeColor: 'rose',
    badge: 'National Incident Command Protocol (MoDMR 2026)',
    leadAuthorities: [
      'Ministry of Disaster Management and Relief (MoDMR)',
      'Department of Disaster Management (DDM)',
      'Cyclone Preparedness Programme (CPP)',
      'Bangladesh Red Crescent Society (BDRCS)',
      'Armed Forces Division (AFD)'
    ],
    sodReference: 'Standing Orders on Disaster (SOD 2019) Clause 2.1 (National Disaster Response Coordination Centre - NDRCC)',
    executiveSummary: 'Standard operational protocol for activating Union/Upazila Disaster Management Committees (UDMC/UzDMC), translating BMD maritime warning signals (Signals 1-11) into field-level community evacuation actions, shelter management, and multi-agency humanitarian relief logistics.',
    hazardVulnerabilitySummary: 'Severe tropical cyclonic storm surges impacting 19 coastal districts; mega-floods along the Jamuna, Padma, and Meghna rivers; and active riverbank erosion displacing thousands of households annually.',
    phasedProtocols: [
      {
        stepNumber: '1.1',
        title: 'NDRCC Incident Command Activation & Alert Dissemination (Signal 4 to Signal 7)',
        phase: 'pre-disaster',
        timeline: 'T-48h to T-24h (Warning Stage)',
        leadAgency: 'MoDMR NDRCC & CPP Volunteer Network',
        triggerThreshold: 'BMD issues Warning Signal No. 4 or Local Warning Signal No. 5-7.',
        detailedProtocol: 'Activate Emergency Operation Centers (EOCs) at National, District, and Upazila levels with 24/7 duty roster. Deploy CPP volunteers with megaphones, sirens, and signal flags (1 flag = Signal 4; 2 flags = Signal 5-7) to alert coastal fishing boats, market centers, and remote islands.',
        technicalSpecs: [
          'Volunteer mobilization: 76,000+ CPP volunteers across 43 coastal upazilas activated',
          'Boat recall mandate: Enforce complete return of all deep-sea fishing trawlers to safe harbors'
        ],
        equipmentNeeded: ['VHF Radio sets', 'Hand-crank sirens', 'Megaphones', 'CPP Signal Flags'],
        criticalWarning: 'Halt all inland water vessel navigation and school operations immediately upon Signal 6 announcement.'
      },
      {
        stepNumber: '1.2',
        title: 'Mandatory Vulnerable Population Evacuation (Great Danger Signal 8-10)',
        phase: 'pre-disaster',
        timeline: 'T-24h to T-6h (Evacuation Stage)',
        leadAgency: 'District Administration, Police, BGB, Coast Guard & CPP',
        triggerThreshold: 'BMD issues Great Danger Signal No. 8, 9, or 10, indicating imminent landfall of severe cyclonic storm.',
        detailedProtocol: 'Execute prioritized evacuation of vulnerable demographics: pregnant mothers, infants, elderly, and persons with disabilities (PWD) to designated multi-purpose cyclone shelters. Staging transport via military trucks, motorized engine boats, and community vehicles.',
        technicalSpecs: [
          'Shelter allocation standard: 3.5 square meters per family unit in multi-purpose cyclone shelters',
          'Registration: Maintain biometric or digital logbooks of all sheltered evacuees with emergency contacts'
        ],
        equipmentNeeded: ['Life jackets', 'Stretcher sets', 'Evacuation buses and speedboats', 'Emergency battery torches'],
      },
      {
        stepNumber: '2.1',
        title: 'Active Strike Incident Command, Search & Rescue, and Medical First Response',
        phase: 'during-event',
        timeline: 'T-0 to T+24h (Impact & Search Phase)',
        leadAgency: 'Bangladesh Fire Service & Civil Defence (FSCD), Armed Forces Division (AFD), BDRCS',
        triggerThreshold: 'Severe storm surge landfall, structural collapses, or breached flood embankments.',
        detailedProtocol: 'Deploy specialized urban search and rescue (USAR) and water rescue units equipped with inflatable Zodiac boats, chain saws, and hydraulic cutters. Provide immediate trauma triage and first aid stabilization at shelter clinics.',
        technicalSpecs: [
          'Rescue priority: Life-threatening water entrapment > structural entrapment > minor injuries',
          'Emergency telecommunications: Operate satellite phones (Thuraya/Iridium) when cellular networks collapse'
        ],
        equipmentNeeded: ['Inflatable motor rescue boats', 'Chain saws for clearing blocked highways', 'Satellite phones', 'First Aid trauma kits'],
      },
      {
        stepNumber: '2.2',
        title: 'Shelter Emergency Rations & Dry Food Distribution',
        phase: 'during-event',
        timeline: 'T+6h to T+48h',
        leadAgency: 'Department of Disaster Management (DDM) & World Food Programme (WFP)',
        triggerThreshold: 'Evacuees confined in shelters without cooking fuel or safe water.',
        detailedProtocol: 'Distribute pre-cooked dry food packs (Flattened rice - Chira, Gur / Molasses, High Energy Biscuits - HEB) and potable water jerrycans directly to families in shelters. Establish separate secure zones for women and children.',
        technicalSpecs: [
          'Nutritional ration standard: Minimum 2,100 kcal per person per day (including 100g High Energy Biscuits)',
          'Safe water ration: Minimum 3.0 Liters drinking water per person per day'
        ],
        equipmentNeeded: ['WFP High Energy Biscuits', 'Jerrycans (10L/20L)', 'Sealed dry food packs'],
      },
      {
        stepNumber: '3.1',
        title: 'Rapid Damage, Need & Loss Assessment (D-Form Compilation via HazardNet)',
        phase: 'post-disaster',
        timeline: 'T+24h to T+72h',
        leadAgency: 'Upazila Nirbahi Officer (UNO) & Project Implementation Officer (PIO)',
        triggerThreshold: 'Storm passage or flood crest recession.',
        detailedProtocol: 'Complete standard government Disaster Assessment Forms (D-Form / JNA) capturing destroyed housing units, casualties, displaced persons, embankment breaches, and agricultural acreage losses. Synchronize geotagged data with national NDRCC servers.',
        technicalSpecs: [
          'Assessment deadline: Preliminary SOS report within 24 hours; comprehensive D-Form within 72 hours',
          'Severity classification: Categorize Union damage levels into Severe, Moderate, or Minimal'
        ],
        equipmentNeeded: ['Tablets with HazardNet mobile collector', 'GPS receivers', 'Drone aerial survey units'],
      },
      {
        stepNumber: '3.2',
        title: 'Gratuitous Relief (GR) Cash, Corrugated Iron (CI) Sheet & Food Distribution',
        phase: 'post-disaster',
        timeline: 'T+3d to T+30d',
        leadAgency: 'Ministry of Disaster Management and Relief & District Relief and Rehabilitation Officer (DRRO)',
        triggerThreshold: 'National Disaster Management Committee (NDMC) relief fund disbursement.',
        detailedProtocol: 'Distribute government relief packages comprising Gratuitous Relief (GR) Cash, Vulnerable Group Feeding (VGF) rice (30kg/family), Corrugated Iron (CI) roofing sheets, and cash house-building grants (Taka 6,000 to 10,000 per destroyed house) to verified beneficiary lists.',
        technicalSpecs: [
          'Shelter rebuilding package: 2 bundles of CI sheet (0.42mm thickness) + BDT 6,000 cash grant per destroyed house',
          'VGF rice allocation: 30 kg certified fortified rice per registered vulnerable family'
        ],
        equipmentNeeded: ['CI roofing sheets', 'Fortified rice sacks', 'Mobile financial service (MFS / bKash / Nagad) disbursement'],
      }
    ],
    technicalSpecs: [
      {
        name: 'WFP High Energy Biscuits (HEB)',
        category: 'Emergency Nutrition Ration',
        toleranceLevel: 'Immediate shelf-stable energy without requiring water or cooking',
        recommendedDosage: '100g packet provides 450 kcal + 10g protein + 15 essential micronutrients',
        targetCondition: 'First 72 hours of sudden displacement in cyclone/flood shelters',
        notes: 'Enriched with Vitamin A, Iron, Zinc, and Iodine; ready to eat.'
      },
      {
        name: 'Multi-Purpose Cyclone Shelter Standard (Type-3)',
        category: 'Disaster Infrastructure',
        toleranceLevel: 'Wind speed resistance up to 260 km/h; Storm surge elevation > 4.5m HFL',
        recommendedDosage: 'Design capacity: 1,500 people + ground floor for 300 livestock',
        targetCondition: 'Coastal polders and islands (Chars) exposed to Category 4/5 cyclones',
        notes: 'Equipped with rainwater harvesting tanks, solar power backup, and separate sanitation facilities.'
      },
      {
        name: 'Corrugated Galvanized Iron (CI) Roofing Sheet',
        category: 'Emergency Shelter Reconstruction',
        toleranceLevel: 'Corrosion resistant; minimum 0.42mm thickness (120 g/m² zinc coating)',
        recommendedDosage: '2-4 bundles (1 bundle = 72 running feet) per destroyed dwelling unit',
        targetCondition: 'Post-cyclone, tornado, and river erosion housing reconstruction',
        notes: 'Must be anchored with J-hooks to reinforced timber or concrete framing.'
      },
      {
        name: 'Vulnerable Group Feeding (VGF) Fortified Rice',
        category: 'Social Safety Net Relief',
        toleranceLevel: 'Alleviates post-disaster food insecurity and malnutrition',
        recommendedDosage: '30 kg rice per marginalized family per month for 3 consecutive months',
        targetCondition: 'Post-disaster recovery phase in severely affected upazilas',
        notes: 'Contains fortified rice kernels (FRK) blended with essential micronutrients.'
      }
    ],
    officialDocumentation: [
      {
        title: 'Ministry of Disaster Management and Relief (MoDMR) Central Hub',
        issuingBody: 'Ministry of Disaster Management and Relief (MoDMR)',
        docType: 'Official Portal',
        url: 'https://modmr.gov.bd/',
        description: 'National disaster policies, emergency relief budget allocations, SOD 2019 documentation, and ministerial orders.'
      },
      {
        title: 'Department of Disaster Management (DDM) Portal',
        issuingBody: 'Department of Disaster Management (DDM)',
        docType: 'Official Portal',
        url: 'https://ddm.gov.bd/',
        description: 'National Disaster Response Coordination Centre (NDRCC) daily situation reports, shelter directories, and VGF allocation lists.'
      },
      {
        title: 'Cyclone Preparedness Programme (CPP) Portal',
        issuingBody: 'CPP (MoDMR & BDRCS Joint Initiative)',
        docType: 'Official Portal',
        url: 'https://cpp.gov.bd/',
        description: 'Volunteer training manuals, coastal early warning signal charts, flag signaling protocols, and shelter maps.'
      },
      {
        title: 'Bangladesh Red Crescent Society (BDRCS) Emergency Operations',
        issuingBody: 'Bangladesh Red Crescent Society (BDRCS)',
        docType: 'Official Portal',
        url: 'https://bdrcs.org/',
        description: 'Humanitarian response operations, emergency family kit standards, tracing services, and community disaster response.'
      },
      {
        title: 'Inter-Agency Standing Committee (IASC) Humanitarian System',
        issuingBody: 'UN OCHA / IASC',
        docType: 'WHO/UN Guideline',
        url: 'https://www.unocha.org/',
        description: 'Global standards for multi-sector initial rapid assessment (MIRA), emergency cluster activation, and sphere humanitarian standards.'
      }
    ],
    emergencyContacts: [
      {
        agencyName: 'National Disaster Response Coordination Centre (NDRCC)',
        departmentOrCell: 'Ministry of Disaster Management and Relief (MoDMR)',
        roleOrDesignation: 'Director (NDRCC) / Assistant Director',
        hotline: '1090 (Toll-Free Interactive Voice Response - IVR Weather & Disaster Alert)',
        landline: '+88-02-9549148 / +88-02-9540567',
        officialEmail: 'ndrcc@modmr.gov.bd',
        address: 'Building 4, Bangladesh Secretariat, Dhaka-1000, Bangladesh',
        scope: 'Government of Bangladesh'
      },
      {
        agencyName: 'National Emergency Service (Bangladesh Police & FSCD)',
        departmentOrCell: 'Emergency Operations Center',
        roleOrDesignation: 'National Duty Dispatcher (Police / Fire / Ambulance)',
        hotline: '999 (National 24/7 Toll-Free Emergency Dispatch)',
        landline: '+88-02-9571000',
        officialEmail: 'info@police.gov.bd',
        address: 'Police Headquarters, 6 Phoenix Road, Fulbaria, Dhaka-1000',
        scope: 'Government of Bangladesh'
      },
      {
        agencyName: 'Cyclone Preparedness Programme (CPP)',
        departmentOrCell: 'Operations & Volunteer Command Center',
        roleOrDesignation: 'Director (Operations) & Field Coordinator',
        hotline: '+88-02-9351348',
        officialEmail: 'cpp_director@yahoo.com',
        address: '684-686, Bara Moghbazar, Dhaka-1217, Bangladesh',
        scope: 'Government of Bangladesh'
      },
      {
        agencyName: 'Bangladesh Red Crescent Society (BDRCS)',
        departmentOrCell: 'Disaster Response & Operations Department (DRED)',
        roleOrDesignation: 'Director (Disaster Response) / Secretary General',
        hotline: '+88-02-9352226',
        officialEmail: 'info@bdrcs.org',
        address: '684-686, Red Crescent National Headquarters, Bara Moghbazar, Dhaka-1217',
        scope: 'Government of Bangladesh'
      },
      {
        agencyName: 'UN Office for the Coordination of Humanitarian Affairs (UN OCHA)',
        departmentOrCell: 'Humanitarian Advisory Team (HAT) Bangladesh',
        roleOrDesignation: 'Humanitarian Affairs Officer / Cluster Coordinator',
        hotline: '+88-02-55668088',
        officialEmail: 'ocha-bangladesh@un.org',
        address: 'UN Resident Coordinator Office, IDB Bhaban, Sher-e-Bangla Nagar, Dhaka-1207',
        scope: 'International Humanitarian Agency'
      }
    ],
    emailTemplate: {
      subject: '[EMERGENCY-HUMANITARIAN-DISPATCH] Urgent Request for Multi-Sector Evacuation, Rescue & Relief Support - District: [DISTRICT_NAME]',
      recipientDefault: 'ndrcc@modmr.gov.bd, cpp_director@yahoo.com, info@bdrcs.org, ocha-bangladesh@un.org',
      bodyStructure: `To:
Director, National Disaster Response Coordination Centre, MoDMR (ndrcc@modmr.gov.bd)
Director (Operations), Cyclone Preparedness Programme (cpp_director@yahoo.com)
Director (Disaster Response), Bangladesh Red Crescent Society (info@bdrcs.org)
Humanitarian Affairs Officer, UN OCHA Bangladesh (ocha-bangladesh@un.org)

Subject: [EMERGENCY-HUMANITARIAN-DISPATCH] Urgent Request for Multi-Sector Evacuation, Rescue & Relief Support - District: [DISTRICT_NAME]

Dear Authorities,

This emergency sitrep and urgent requisition is submitted by the District Disaster Management Committee for [DISTRICT_NAME], reporting critical multi-sector humanitarian devastation following [HAZARD_TYPE: Super Cyclone / Category-5 Storm Surge / Major Riverine Flood].

1. HUMANITARIAN EMERGENCY SCOPE:
- Affected Upazilas: [UPAZILAS_AFFECTED]
- Estimated Displaced Persons: [DISPLACED_COUNT] people
- Destroyed / Submerged Dwelling Units: [HOUSES_DESTROYED] units
- Inundated Shelters Requiring Emergency Air/Boat Drop: [SHELTERS_COUNT] units

2. URGENT RELIEF & LOGISTICS REQUISITIONS:
- Emergency Speedboats & Zodiac Water Rescue Craft: [BOATS_COUNT] units
- WFP High Energy Biscuits (HEB) & Emergency Dry Food: [HEB_CARTONS] cartons
- Gratuitous Relief (GR) Cash Assistance: BDT [AMOUNT_BDT]
- Emergency Corrugated Iron (CI) Roofing Sheets: [CI_BUNDLES] bundles
- Emergency Family Tents & Tarpaulins (Silpaulin): [TENTS_COUNT] units
- Potable Water Jerrycans (20L capacity): [JERRYCANS_COUNT] units

3. INCIDENT COMMAND POINT OF CONTACT:
- Deputy Commissioner (DC) / District Magistrate: [DC_NAME]
- Emergency Control Room Hotline: [DC_PHONE]
- Emergency Landing / Heli-pad Staging Coordinates: [COORDINATES]

We request immediate deployment of the Armed Forces Division (Army/Navy/Air Force) assets for deep-water rescue and aerial relief drop.

Sincerely,
[YOUR_NAME_AND_DESIGNATION]
[DISTRICT INCIDENT COMMAND & DISASTER MANAGEMENT COMMITTEE]
Contact: [PHONE_NUMBER]`
    }
  }
};
