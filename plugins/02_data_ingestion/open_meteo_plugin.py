# plugins/02_data_ingestion/open_meteo_plugin.py
import requests
import pandas as pd

class OpenMeteoPlugin:
    """Standardized connector for Open-Meteo Deterministic & ERA5 APIs."""
    
    BASE_URL = "https://api.open-meteo.com/v1/forecast"
    
    def __init__(self, lat: float, lon: float):
        self.lat = lat
        self.lon = lon
        
    def fetch_16day_forecast(self) -> pd.DataFrame:
        params = {
            "latitude": self.lat,
            "longitude": self.lon,
            "daily": "temperature_2m_max,precipitation_sum,et0_fao_evapotranspiration_sum,wind_speed_10m_max",
            "timezone": "Asia/Dhaka",
            "forecast_days": 16
        }
        try:
            resp = requests.get(self.BASE_URL, params=params, timeout=10)
            if resp.status_code == 200:
                data = resp.json().get('daily', {})
                return pd.DataFrame(data)
        except Exception as e:
            print(f"Error fetching Open-Meteo data: {e}")
        return pd.DataFrame()
