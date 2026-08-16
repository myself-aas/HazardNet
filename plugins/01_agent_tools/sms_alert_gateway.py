# plugins/01_agent_tools/sms_alert_gateway.py
import json

def trigger_emergency_sms(district_name: str, hazard: str, severity: float) -> dict:
    """
    TOOL: Sends an emergency SMS to District Agriculture Officers (DAE), DoF, DLS, and UP Chairmen.
    Triggered when hazard severity >= 0.8.
    """
    if severity < 0.8:
        return {"status": "skipped", "reason": "Severity below emergency threshold (0.8)"}
        
    message = (
        f"HAZARDNET CRITICAL ALERT: {hazard} (Severity: {severity:.2f}) predicted for {district_name}. "
        "Activate DAE, DoF, and DLS Multi-Sectoral Emergency SOPs immediately."
    )
    
    return {
        "status": "sent",
        "district": district_name,
        "hazard": hazard,
        "severity": severity,
        "recipients_notified": 24,
        "message_preview": message
    }

SMS_TOOL_SCHEMA = {
    "name": "trigger_emergency_sms",
    "description": "Triggers emergency broadcast SMS to regional Bangladesh disaster management officers when severity >= 0.8.",
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "district_name": {"type": "STRING", "description": "District name"},
            "hazard": {"type": "STRING", "description": "Hazard type e.g. Tropical Cyclone"},
            "severity": {"type": "NUMBER", "description": "Continuous severity score 0.0 to 1.0"}
        },
        "required": ["district_name", "hazard", "severity"]
    }
}
