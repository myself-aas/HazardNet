# HazardNet Model Card (FP32 TFLite)

## Model Details
- **Architecture**: 3D Depthwise-Separable CNN with Squeeze-and-Excitation (SE) Blocks
- **Input Shape**: `(1, 10, 64, 64, 15)` [NDHWC format for TFLite runtime]
- **Parameters**: ~1.2M (0.75 MB FP32)
- **Outputs**: 
  - `hazard_logits`: 8 classes (Cold Wave, Drought, Fire, Flash Flood, Flood, Heat Wave, Severe Local Storm, Tropical Cyclone)
  - `severity_score`: Continuous float [0.0 - 1.0]

## Training Data
- **Source**: Google Earth Engine (Sentinel-1/2, Landsat-8/9, ERA5-Land reanalysis)
- **Events**: 2,931 unique hazard events (2000-2025) across 64 Bangladesh districts.
- **Validation**: Event-Based 5-Fold Cross Validation (Acc: 98.8%), Spatial Leave-One-District-Out (Acc: 95.6%).

## Multi-Sectoral Guidance Integration
- **Institutional Alignment**: Integrated protocols from DAE (Crops), DoF (Fisheries), and DLS (Livestock & Veterinary).
- **Decision Engine**: Dynamic RAG routing based on district economic baselines and hazard severity thresholds.

## Limitations & Edge Cases
- **Temporal Shift**: Performance drops on extreme out-of-distribution climate non-stationarity events.
- **Quantization**: INT8 quantization bypassed due to TFLite `CONV_3D` kernel constraints in web/mobile runtimes. Model operates in native FP32.
