# plugins/01_agent_tools/bwdb_river_gauge.py
import requests
import json

def get_bwdb_danger_level(district_name: str) -> dict:
    """
    TOOL: Fetches current river water levels from Bangladesh Water Development Board (BWDB).
    The LLM calls this if HazardNet predicts 'Flood' or 'Flash Flood' with Severity > 0.5.
    """
    try:
        # Simulated response for architecture demonstration and API fallback
        data = {
            "station": f"{district_name} Main Gauge Station",
            "current_level_m": 18.5,
            "danger_level_m": 18.0,
            "trend": "Rising"
        }
        
        is_danger = data["current_level_m"] > data["danger_level_m"]
        
        return {
            "status": "success",
            "district": district_name,
            "river_level": data["current_level_m"],
            "danger_level": data["danger_level_m"],
            "is_overflowing": is_danger,
            "trend": data["trend"]
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

# Metadata for Gemini Function Calling Schema
BWDB_TOOL_SCHEMA = {
    "name": "get_bwdb_danger_level",
    "description": "Fetches real-time river water levels and danger status from BWDB for a specific district in Bangladesh.",
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "district_name": {"type": "STRING", "description": "Name of the district (e.g., 'Sirajganj', 'Sunamganj')"}
        },
        "required": ["district_name"]
    }
}
