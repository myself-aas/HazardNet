"""
hazardnet_bd_thresholds.py
==========================
Bangladesh-calibrated severity thresholds for the HazardNet pipeline.

WHY THIS MODULE EXISTS
----------------------
The global thresholds in hazardnet_scientific_pipeline.py (EHFsev, FWI,
Saffir-Simpson 1-min winds, SPEI alone) are internationally standardized but
do not match how hazards are MEASURED and WARNED in Bangladesh:

  * BMD declares a cold wave day at Tmin <= 10 C; cold SPELLS are further
    graded by Tavg classes from ~17 C (mild) down to <=13 C (extreme).
    The frequently cited "16 C" in Bangladesh is the tropical health
    "cold night" / mild-spell onset (Tavg band 16-17 C), NOT the BMD
    meteorological cold wave threshold. Both are anchored below.
  * BMD heat waves are pure Tmax classes: 36-38 mild, 38-40 moderate,
    40-42 severe, >42 extreme; BDRCS triggers on heat index >= 38 C.
  * FFWC defines flood state by river level RELATIVE TO each gauge's danger
    level (~90th percentile flow): warning zone within 50 cm below, flood at
    danger level, severe flood > 100 cm above.
  * BMD heavy rain = 44-88 mm/24 h; very heavy > 88 mm/24 h; the 2022
    Sylhet catastrophe produced multi-day 150-300 mm totals.
  * Kalbaishakhi (nor'wester) classes are WIND-based: light 61-90 km/h,
    moderate 91-120 km/h, severe 121-149 km/h (BMD data, Hoque et al. 2022).
  * Bay of Bengal cyclones are classified on the IMD/WMO NIO scale
    (3-min sustained winds), not the Atlantic 1-min Saffir-Simpson scale.

DOI VALIDATION (2026-09-17)
---------------------------
Every DOI below was resolved against doi.org / publisher records (Springer,
Nature, Wiley, MDPI, PubMed Central, BanglaJol). Items marked
verified_url=True were validated by direct page retrieval where the DOI
string was not printed in the fetched record - cite the URL in those cases.
"""

from __future__ import annotations
import numpy as np

# ----------------------------------------------------------------------------
# Bangladesh reference registry
# ----------------------------------------------------------------------------
REFERENCES_BD = {
    "tcrr2023": dict(
        doi="10.1016/j.tcrr.2023.06.002",
        cite="Earl-Spurr et al. (2023) IWTC-10 tropical cyclone wind hazards "
             "summary. Trop. Cycl. Res. Rev. 12(2).",
        validated=True),
    "jweia2022": dict(
        doi="10.1016/j.jweia.2022.105026",
        cite="Tong et al. (2022) ConvLSTM tropical cyclone intensity/track "
             "prediction. J. Wind Eng. Ind. Aerodyn. 226:105026.",
        validated=True),
    "bd_cold_lstm": dict(
        doi="10.1186/s44329-026-00058-6",
        cite="(2026) Forecasting cold wave in Bangladesh: a validated machine "
             "learning approach for early warning and vulnerability reduction. "
             "J. Clim. Change Health Adapt. (Springer).",
        validated=True),                      # BMD standard: cold wave day Tmin < 10 C
    "bd_cold_alam": dict(
        doi="10.3390/app13127030",
        cite="Alam et al. (2023) A percentile method to determine cold days and "
             "spells in Bangladesh. Applied Sciences 13(12):7030.",
        validated=True),                      # Tavg classes: mild 16-17, moderate 15-16,
                                              # very 14-15, severe 13-14, extreme <=13 C
    "bd_cold_forewarn": dict(
        doi=None,
        cite="Start Network / FOREWARN Bangladesh (2022) Anticipatory action "
             "cold-wave triggers: Tmin < 8 C (2 days); <= 12 C with DTR <= 6 C; "
             "or <= 6 C. anticipation-hub.org.",
        verified_url=True),                   # institutional trigger levels
    "bd_heat_bmd": dict(
        doi=None,
        cite="(2024) Are hotspots and frequencies of heat waves changing over "
             "time? PLOS Climate (PMC11111018).",
        verified_url=True),                   # BMD classes: 36-38 mild, 38.1-40 moderate,
                                              # 40.1-42 severe, >42 extreme C
    "bd_heat_bdrcs": dict(
        doi=None,
        cite="IFRC/BDRCS (2025) Bangladesh Heatwave DREF Final Report MDRBD034 "
             "(ReliefWeb): heat index >= 38 C trigger; severe >= 40 C.",
        verified_url=True),                   # operational humanitarian trigger
    "bd_flood_ffwc": dict(
        doi=None,
        cite="FFWC/BWDB (2026) Official definitions (ffwc.gov.bd): warning zone "
             "= within 50 cm below danger level; flood = at/above danger level "
             "to +100 cm; severe flood = > 100 cm above danger level.",
        verified_url=True),                   # institutional operational states
    "bd_flood_glofas": dict(
        doi="10.1111/jfr3.12959",
        cite="Hossain et al. (2025) A decision-led evaluation approach for flood "
             "forecasting system developments: GloFAS in Bangladesh. "
             "J. Flood Risk Management 18:e12959.",
        validated=True),                      # danger level ~ 90th percentile flow;
                                              # severe ~ 99th percentile; POD/FAR framing
    "bd_flash_haor": dict(
        doi=None,
        cite="(2026) HaorFloodAlert: a 72-hour ML early warning system for flash "
             "floods in Bangladesh's haor wetlands. arXiv:2605.20167.",
        verified_url=True),                   # alert tiers 0.40/0.65/0.75/0.85;
                                              # FFWC SW269 inundation ~5.77 m
    "bd_flash_bmd": dict(
        doi=None,
        cite="BMD operational rainfall classes (via FFWC bulletins/Daily Star "
             "2023-2026): heavy rain 44-88 mm/24 h; very heavy rain > 88 mm/24 h.",
        verified_url=True),                   # institutional thresholds
    "bd_drought_kam": dict(
        doi="10.1038/s41598-022-24146-0",
        cite="Kamruzzaman et al. (2022) Spatiotemporal drought analysis in "
             "Bangladesh using SPI and SPEI. Scientific Reports 12:20694.",
        validated=True),                      # SPEI-based drought mapping of Bangladesh;
                                              # hotspots Barind Tract & Tista basin
    "bd_drought_ml": dict(
        doi=None,
        cite="(2024) Identification of influential weather parameters and "
             "seasonal drought prediction in Bangladesh using machine learning. "
             "PMC10767098.",
        verified_url=True),                   # WMO SPEI classes applied to Bangladesh:
                                              # moderate <= -1.0, severe <= -1.5,
                                              # extreme <= -2.0
    "bd_fire_barik": dict(
        doi="10.1038/s43247-023-01112-w",
        cite="Barik et al. (2023) Climate change strongly affects future fire "
             "weather danger in Indian forests. Communications Earth & "
             "Environment 4:435.",
        validated=True),                      # NOTE: full valid s43247 DOI (contrast with
                                              # the incomplete 10.1038/s43247). Humid NE
                                              # zone shows LOWER FWI thresholds than arid
                                              # zones - relevant to humid Bangladesh.
    "bd_storm_hoque": dict(
        doi=None,
        cite="Hoque et al. (2022) An overview of thunderstorms over Bangladesh. "
             "Bangladesh Journal of Physics 29(1):1-11 (BanglaJol id 78684).",
        verified_url=True),                   # Kalbaishakhi wind classes: light 61-90,
                                              # moderate 91-120, severe 121-149 km/h
    "bd_tc_wmo": dict(
        doi=None,
        cite="WMO (2023) Classification of tropical cyclones (wmo.int): NIO "
             "scale - cyclonic storm >= 63 km/h, severe >= 89, very severe >= "
             "118, extremely severe >= 166, super cyclonic >= 221 km/h (3-min).",
        verified_url=True),                   # institutional scale for Bay of Bengal
    "bd_tc_bmd": dict(
        doi="10.1007/s43762-023-00113-x",
        cite="Rahman et al. (2024) Tropical cyclone warning and forecasting "
             "system in Bangladesh. Computational Urban Science 4:4.",
        validated=True),                      # BMD warning system practice
}


# ----------------------------------------------------------------------------
# Bangladesh severity thresholds  (physical index -> normalized severity)
# ----------------------------------------------------------------------------
SEVERITY_THRESHOLDS_BD = {
    "Cold Wave": dict(
        index="minimum temperature Tmin (deg C), BMD operational",
        anchors=[(16, 0.10), (13, 0.30), (10, 0.50), (8, 0.70), (6, 0.90), (4, 1.0)],
        # 16 C: tropical health 'cold night' / Alam-2023 mild-spell band
        #       (Tavg 16-17 C) - the user's cited onset;
        # 13 C: Alam severe-very cold day band (Tavg 13-15 C);
        # 10 C: BMD cold wave day (bd_cold_lstm);
        #  8 C: FOREWARN trigger Tmin < 8 C persisting >= 2 days;
        #  6 C: FOREWARN extreme trigger Tmin <= 6 C (bd_cold_forewarn).
        tiers=dict(watch=0.30, warning=0.50, severe=0.70),
        interpretation={
            0.10: "Tmin ~16 C - cold night / mild cold spell onset (health watch)",
            0.30: "Tmin ~13 C - moderate cold spell conditions",
            0.50: "Tmin <= 10 C - BMD COLD WAVE DAY (warning)",
            0.70: "Tmin <= 8 C - severe cold wave (FOREWARN trigger)",
            0.90: "Tmin <= 6 C - extreme cold wave",
        },
        refs=["bd_cold_lstm", "bd_cold_alam", "bd_cold_forewarn"],
    ),
    "Heat Wave": dict(
        index="maximum temperature Tmax (deg C), BMD operational classes",
        anchors=[(36, 0.25), (38, 0.50), (40, 0.70), (42, 0.85), (44, 1.0)],
        # 36 C: mild heat wave onset; 38 C: moderate = warning class
        # (BDRCS heat-index trigger also at 38); 40 C: severe (DREF >= 40 C);
        # 42 C: extreme. BMD classes per bd_heat_bmd / bd_heat_bdrcs.
        tiers=dict(watch=0.25, warning=0.50, severe=0.70),
        interpretation={
            0.25: "Tmax >= 36 C - mild heat wave onset (watch)",
            0.50: "Tmax >= 38 C - moderate heat wave (WARNING; BDRCS HI trigger)",
            0.70: "Tmax >= 40 C - severe heat wave (DREF severe class)",
            0.85: "Tmax >= 42 C - extreme/very severe heat wave",
        },
        refs=["bd_heat_bmd", "bd_heat_bdrcs"],
    ),
    "Flood": dict(
        index="river water level relative to FFWC danger level (m)",
        anchors=[(-0.5, 0.30), (0.0, 0.50), (1.0, 0.75), (2.0, 1.0)],
        # FFWC operational states (bd_flood_ffwc): warning zone = within 50 cm
        # BELOW danger level; flood = at danger level (~90th percentile flow,
        # bd_flood_glofas); severe flood = > 100 cm ABOVE danger level.
        tiers=dict(watch=0.30, warning=0.50, severe=0.75),
        interpretation={
            0.30: "level within 0.5 m below danger level - FFWC warning zone",
            0.50: "level at danger level (~90th pct flow) - FLOOD onset",
            0.75: "level > 1 m above danger level - SEVERE FLOOD (FFWC class)",
            1.00: "level > 2 m above danger level - extreme inundation",
        },
        refs=["bd_flood_ffwc", "bd_flood_glofas"],
    ),
    "Flash Flood": dict(
        index="24-h rainfall (mm), BMD heavy-rain classes + haor response",
        anchors=[(44, 0.40), (88, 0.65), (150, 0.85), (250, 1.0)],
        # 44 mm: BMD heavy rain onset (bd_flash_bmd); 88 mm: very heavy;
        # 150 mm: 2022-Sylhet-class daily totals (bd_flash_haor context;
        #   Nikli 160 mm, Bhola 151 mm recorded Apr 2026);
        # 250 mm: exceptional Cherrapunji-fed extremes.
        tiers=dict(watch=0.40, warning=0.65, severe=0.85),
        interpretation={
            0.40: "24-h rain >= 44 mm - BMD heavy rain (flash-flood watch in haors)",
            0.65: "24-h rain >= 88 mm - very heavy rain (WARNING)",
            0.85: "24-h rain >= 150 mm - Sylhet-2022-class flash flood (SEVERE)",
            1.00: "24-h rain >= 250 mm - exceptional upstream-driven extreme",
        },
        refs=["bd_flash_bmd", "bd_flash_haor"],
    ),
    "Drought": dict(
        index="SPEI-3 (WMO classes as applied to Bangladesh)",
        anchors=[(-1.0, 0.30), (-1.5, 0.60), (-2.0, 0.85), (-2.5, 1.0)],
        # Identical numerical classes to the global config, but now anchored to
        # Bangladesh studies: bd_drought_ml (moderate <= -1.0, severe <= -1.5,
        # extreme <= -2.0) and bd_drought_kam (SPI/SPEI Bangladesh mapping;
        # hotspots Barind Tract & Tista basin).
        tiers=dict(watch=0.30, warning=0.60, severe=0.85),
        interpretation={
            0.30: "SPEI-3 <= -1.0 - moderate drought onset (Bangladesh)",
            0.60: "SPEI-3 <= -1.5 - severe drought (rabi/pre-kharif risk)",
            0.85: "SPEI-3 <= -2.0 - extreme drought (Barind-type event)",
        },
        refs=["bd_drought_ml", "bd_drought_kam"],
    ),
    "Fire": dict(
        index="Canadian Fire Weather Index (FWI), humid-zone calibrated",
        anchors=[(11.2, 0.30), (21.3, 0.55), (38.0, 0.75), (50.0, 0.90), (70.0, 1.0)],
        # EFFIS classes retained, with bd_fire_barik justification: humid
        # regions (incl. humid NE India adjoining Bangladesh) reach dangerous
        # fire occurrence probability at LOWER FWI values than arid zones;
        # pre-monsoon (Mar-May) is the Bangladesh fire-danger season.
        tiers=dict(watch=0.30, warning=0.55, severe=0.75),
        interpretation={
            0.30: "FWI >= 11.2 - moderate danger (dry-season watch)",
            0.55: "FWI >= 21.3 - high danger (warning; humid-zone relevant)",
            0.75: "FWI >= 38 - very high danger (severe)",
        },
        refs=["bd_fire_barik"],
    ),
    "Severe Local Storm": dict(
        index="maximum gust wind speed (km/h), Kalbaishakhi classes",
        anchors=[(45, 0.25), (61, 0.40), (91, 0.65), (121, 0.90), (150, 1.0)],
        # 45 km/h: BMD signal-1 squally band (45-60 km/h); 61/91/121 km/h:
        # Hoque et al. 2022 Kalbaishakhi classes light/moderate/severe
        # (bd_storm_hoque); exceptional gusts > 100 km/h documented.
        tiers=dict(watch=0.40, warning=0.65, severe=0.90),
        interpretation={
            0.25: "gusts 45-60 km/h - squally winds (BMD signal 1)",
            0.40: "gusts >= 61 km/h - LIGHT nor'wester onset (watch)",
            0.65: "gusts >= 91 km/h - MODERATE Kalbaishakhi (WARNING)",
            0.90: "gusts >= 121 km/h - SEVERE nor'wester (hail/damage class)",
        },
        refs=["bd_storm_hoque"],
    ),
    "Tropical Cyclone": dict(
        index="maximum sustained wind (km/h, 3-min, WMO/IMD NIO scale)",
        anchors=[(63, 0.25), (89, 0.50), (118, 0.70), (166, 0.85), (221, 1.0)],
        # NIO scale for the Bay of Bengal (bd_tc_wmo): cyclonic storm >= 63,
        # severe cyclonic storm >= 89, very severe >= 118, extremely severe
        # >= 166, super cyclonic >= 221 km/h. Replaces the Atlantic 1-min
        # Saffir-Simpson anchors of the global config (BMD practice per
        # bd_tc_bmd: GDS hoisted on forecast landfall of these classes).
        tiers=dict(watch=0.25, warning=0.50, severe=0.70),
        interpretation={
            0.25: ">= 63 km/h - cyclonic storm (named system; watch/GDS low)",
            0.50: ">= 89 km/h - SEVERE cyclonic storm (WARNING, GDS hoisted)",
            0.70: ">= 118 km/h - VERY SEVERE cyclonic storm (severe)",
            0.85: ">= 166 km/h - EXTREMELY SEVERE (SIDR/Amphan class)",
            1.00: ">= 221 km/h - super cyclonic storm",
        },
        refs=["bd_tc_wmo", "bd_tc_bmd", "tcrr2023", "jweia2022"],
    ),
}


def apply_bd_thresholds(pipeline_module) -> dict:
    """Replace the pipeline's global SEVERITY_THRESHOLDS with Bangladesh
    calibration, in place. Returns a delta report {hazard: change_summary}.

    Scientific justification of the deltas:
      Cold/Heat:   index changes from derived indices (ECFsev/EHFsev) to BMD
                   operational Tmin/Tmax classes - what BMD actually warns on.
      Flood:       index changes from rainfall ratios to FFWC danger-level
                   offsets - the exact states in FFWC bulletins.
      Flash Flood: rainfall anchors from BMD heavy-rain classes + 2022/2026
                   observed Sylhet extremes.
      Storm:       CAPE replaced by Kalbaishakhi gust-wind classes - CAPE
                   measures potential, gusts measure the warned hazard.
      Cyclone:     1-min SSHWS winds replaced by 3-min NIO scale used for
                   Bay of Bengal systems (BMD/IMD practice).
      Drought/Fire: index unchanged; references localized to Bangladesh and
                   humid-zone studies.
    """
    report = {}
    for hazard, cfg in SEVERITY_THRESHOLDS_BD.items():
        old = pipeline_module.SEVERITY_THRESHOLDS[hazard]
        pipeline_module.SEVERITY_THRESHOLDS[hazard] = cfg
        report[hazard] = dict(
            old_index=old["index"], new_index=cfg["index"],
            old_watch=old["tiers"]["watch"], new_watch=cfg["tiers"]["watch"],
            old_warning=old["tiers"]["warning"], new_warning=cfg["tiers"]["warning"],
            old_severe=old["tiers"]["severe"], new_severe=cfg["tiers"]["severe"],
        )
    return report


# ----------------------------------------------------------------------------
# Bangladesh physics tracks (stationary; used under OOD trust fallback)
# ----------------------------------------------------------------------------
def physics_cold_wave_bd(tmin_c=None):
    if tmin_c is None:
        return None, "no Tmin input"
    sev = float(np.interp(tmin_c, [16, 13, 10, 8, 6, 4],
                         [0.10, 0.30, 0.50, 0.70, 0.90, 1.0],
                         left=0.10, right=1.0))
    return sev, f"Tmin={tmin_c}C (BMD cold-wave day at <=10C)"


def physics_heat_wave_bd(tmax_c=None):
    if tmax_c is None:
        return None, "no Tmax input"
    sev = float(np.interp(tmax_c, [36, 38, 40, 42, 44],
                         [0.25, 0.50, 0.70, 0.85, 1.0],
                         left=0.25, right=1.0))
    return sev, f"Tmax={tmax_c}C (BMD classes 36/38/40/42)"


def physics_flood_bd(level_above_danger_m=None, rain_7d_mm=None, rain_p90=None):
    if level_above_danger_m is not None:
        sev = float(np.interp(level_above_danger_m, [-0.5, 0.0, 1.0, 2.0],
                              [0.30, 0.50, 0.75, 1.0], left=0.30, right=1.0))
        return sev, f"level {level_above_danger_m:+.2f} m vs FFWC danger level"
    return None, "no gauge input"


def physics_flash_flood_bd(rain_24h_mm=None):
    if rain_24h_mm is None:
        return None, "no 24-h rainfall input"
    sev = float(np.interp(rain_24h_mm, [44, 88, 150, 250],
                          [0.40, 0.65, 0.85, 1.0], left=0.40, right=1.0))
    return sev, f"24-h rain {rain_24h_mm:.0f} mm (BMD heavy >=44, very heavy >=88)"


def physics_storm_bd(gust_kmh=None, cape_jkg=None):
    if gust_kmh is not None:
        sev = float(np.interp(gust_kmh, [45, 61, 91, 121, 150],
                              [0.25, 0.40, 0.65, 0.90, 1.0], left=0.25, right=1.0))
        return sev, f"gusts {gust_kmh:.0f} km/h (Kalbaishakhi classes 61/91/121)"
    return None, "no gust input"


def physics_cyclone_bd(wind_kmh_3min=None):
    if wind_kmh_3min is None:
        return None, "no wind input"
    sev = float(np.interp(wind_kmh_3min, [63, 89, 118, 166, 221],
                          [0.25, 0.50, 0.70, 0.85, 1.0], left=0.25, right=1.0))
    return sev, f"sustained {wind_kmh_3min:.0f} km/h (NIO scale 63/89/118/166/221)"


PHYSICS_DISPATCH_BD = {
    "Cold Wave": physics_cold_wave_bd,
    "Heat Wave": physics_heat_wave_bd,
    "Flood": physics_flood_bd,
    "Flash Flood": physics_flash_flood_bd,
    "Severe Local Storm": physics_storm_bd,
    "Tropical Cyclone": physics_cyclone_bd,
    # Drought/Fire reuse the global SPEI/FWI tracks (indices unchanged).
}


# ----------------------------------------------------------------------------
# Validation
# ----------------------------------------------------------------------------
def validate_bd_thresholds(pipeline_module) -> list:
    """Proof obligations for the Bangladesh configuration.

    Direction-aware: hazards whose index DROPS as severity rises (Tmin for
    cold waves, SPEI for drought) are validated in deficit space, exactly as
    the pipeline's SeverityNormalizer stores them (negated).
    """
    checks = []
    for hazard, cfg in SEVERITY_THRESHOLDS_BD.items():
        xs_raw = np.array([a[0] for a in cfg["anchors"]], dtype=float)
        ys = np.array([a[1] for a in cfg["anchors"]], dtype=float)
        flip = xs_raw[0] > xs_raw[-1]
        xs = -xs_raw if flip else xs_raw
        checks.append((f"{hazard}: anchors strictly monotonic",
                       bool(np.all(np.diff(xs) > 0))))
        checks.append((f"{hazard}: severity non-decreasing",
                       bool(np.all(np.diff(ys) >= 0))))
        t = cfg["tiers"]
        checks.append((f"{hazard}: watch < warning < severe",
                       t["watch"] < t["warning"] < t["severe"]))
        checks.append((f"{hazard}: all tier levels present in anchors",
                       all(any(abs(y - v) < 1e-9 for _, y in cfg["anchors"])
                           for v in t.values())))
        try:
            n = pipeline_module.SeverityNormalizer(hazard)
            grid_i = np.linspace(xs.min(), xs.max(), 200)   # deficit-space grid
            sv = [n.to_severity(-g if flip else g) for g in grid_i]
            checks.append((f"{hazard}: normalizer monotone over domain",
                           bool(np.all(np.diff(sv) >= -1e-12))))
        except Exception as e:
            checks.append((f"{hazard}: normalizer builds ({e})", False))
        for ref in cfg["refs"]:
            ok = ref in REFERENCES_BD or ref in getattr(pipeline_module, "REFERENCES", {})
            checks.append((f"{hazard}: reference '{ref}' registered", ok))
    return checks


if __name__ == "__main__":
    import importlib.util, sys
    spec = importlib.util.spec_from_file_location(
        "hsp", "/mnt/agents/output/hazardnet_scientific_pipeline.py")
    hsp = importlib.util.module_from_spec(spec)
    sys.modules["hsp"] = hsp
    spec.loader.exec_module(hsp)

    report = apply_bd_thresholds(hsp)
    checks = validate_bd_thresholds(hsp)
    fails = [name for name, ok in checks if not ok]
    print(f"BD threshold checks: {len(checks) - len(fails)}/{len(checks)} passed")
    for name in fails:
        print("  FAIL:", name)

    print("\n--- Bangladesh interpretation table ---")
    for hazard, cfg in SEVERITY_THRESHOLDS_BD.items():
        n = hsp.SeverityNormalizer(hazard)
        print(f"\n{hazard}  [{cfg['index']}]")
        for sev, meaning in sorted(cfg["interpretation"].items()):
            print(f"   s={sev:.2f} ({n.tier(sev):8s}) -> {meaning}")
