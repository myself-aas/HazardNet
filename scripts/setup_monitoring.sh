#!/bin/bash
# HazardNet Monitoring Setup Script
# Sets up Grafana dashboard, UptimeRobot monitors, and alerting

set -e

echo "=========================================="
echo "HazardNet Monitoring Setup"
echo "=========================================="
echo ""

# Check required environment variables
REQUIRED_VARS=(
  "GRAFANA_URL"
  "GRAFANA_API_KEY"
  "UPTIMEROBOT_API_KEY"
  "PRODUCTION_URL"
  "ALERT_EMAIL"
)

missing_vars=()
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    missing_vars+=("$var")
  fi
done

if [ ${#missing_vars[@]} -gt 0 ]; then
  echo "❌ Missing required environment variables:"
  printf '   - %s\n' "${missing_vars[@]}"
  echo ""
  echo "Please set these variables and run again:"
  echo "  export GRAFANA_URL=https://grafana.yourdomain.com"
  echo "  export GRAFANA_API_KEY=your-grafana-api-key"
  echo "  export UPTIMEROBOT_API_KEY=your-uptimerobot-api-key"
  echo "  export PRODUCTION_URL=https://hazardnet.vercel.app"
  echo "  export ALERT_EMAIL=alerts@yourdomain.com"
  exit 1
fi

echo "✅ Environment variables validated"
echo ""

# ==========================================
# 1. Set up Grafana Dashboard
# ==========================================
echo "📊 Setting up Grafana dashboard..."

GRAFANA_DASHBOARD_FILE="docs/monitoring/grafana-dashboard.json"

if [ ! -f "$GRAFANA_DASHBOARD_FILE" ]; then
  echo "❌ Dashboard file not found: $GRAFANA_DASHBOARD_FILE"
  exit 1
fi

DASHBOARD_JSON=$(cat "$GRAFANA_DASHBOARD_FILE")

RESPONSE=$(curl -s -X POST "${GRAFANA_URL}/api/dashboards/db" \
  -H "Authorization: Bearer ${GRAFANA_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$DASHBOARD_JSON")

if echo "$RESPONSE" | grep -q '"status":"success"'; then
  DASHBOARD_UID=$(echo "$RESPONSE" | jq -r '.uid')
  DASHBOARD_URL=$(echo "$RESPONSE" | jq -r '.url')
  echo "✅ Grafana dashboard created: ${GRAFANA_URL}${DASHBOARD_URL}"
else
  echo "⚠️ Dashboard creation response: $RESPONSE"
fi
echo ""

# ==========================================
# 2. Configure Prometheus Data Source
# ==========================================
echo "📡 Configuring Prometheus data source..."

PROMETHEUS_CONFIG=$(cat <<EOF
{
  "name": "HazardNet Prometheus",
  "type": "prometheus",
  "access": "proxy",
  "url": "${PRODUCTION_URL}/api/metrics",
  "basicAuth": false,
  "isDefault": true,
  "jsonData": {
    "httpMethod": "GET",
    "timeInterval": "15s"
  }
}
EOF
)

RESPONSE=$(curl -s -X POST "${GRAFANA_URL}/api/datasources" \
  -H "Authorization: Bearer ${GRAFANA_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$PROMETHEUS_CONFIG")

if echo "$RESPONSE" | grep -q '"message":"Datasource added"'; then
  echo "✅ Prometheus data source configured"
else
  echo "⚠️ Data source response: $RESPONSE"
fi
echo ""

# ==========================================
# 3. Set up UptimeRobot Monitors
# ==========================================
echo "⏰ Setting up UptimeRobot monitors..."

# Monitor 1: Homepage Availability
echo "  Creating homepage monitor..."
RESPONSE=$(curl -s -X POST "https://api.uptimerobot.com/v2/newMonitor" \
  -H "Content-Type: application/json" \
  -d "{
    \"api_key\": \"${UPTIMEROBOT_API_KEY}\",
    \"friendly_name\": \"HazardNet Homepage\",
    \"url\": \"${PRODUCTION_URL}\",
    \"type\": 1,
    \"interval\": 300,
    \"timeout\": 30,
    \"alert_contacts\": \"${ALERT_EMAIL}\"
  }")

if echo "$RESPONSE" | grep -q '"stat":"ok"'; then
  echo "  ✅ Homepage monitor created"
else
  echo "  ⚠️ Homepage monitor response: $RESPONSE"
fi

# Monitor 2: API Health Endpoint
echo "  Creating API health monitor..."
RESPONSE=$(curl -s -X POST "https://api.uptimerobot.com/v2/newMonitor" \
  -H "Content-Type: application/json" \
  -d "{
    \"api_key\": \"${UPTIMEROBOT_API_KEY}\",
    \"friendly_name\": \"HazardNet API Health\",
    \"url\": \"${PRODUCTION_URL}/health\",
    \"type\": 1,
    \"interval\": 300,
    \"timeout\": 30,
    \"alert_contacts\": \"${ALERT_EMAIL}\"
  }")

if echo "$RESPONSE" | grep -q '"stat":"ok"'; then
  echo "  ✅ API health monitor created"
else
  echo "  ⚠️ API health response: $RESPONSE"
fi

# Monitor 3: Forecast Data Freshness (HTTP Keyword)
echo "  Creating forecast freshness monitor..."
RESPONSE=$(curl -s -X POST "https://api.uptimerobot.com/v2/newMonitor" \
  -H "Content-Type: application/json" \
  -d "{
    \"api_key\": \"${UPTIMEROBOT_API_KEY}\",
    \"friendly_name\": \"HazardNet Forecast Freshness\",
    \"url\": \"${PRODUCTION_URL}/api/v1/forecasts?district_id=1\",
    \"type\": 2,
    \"sub_type\": 2,
    \"keyword_type\": 1,
    \"keyword_value\": \"prediction_date\",
    \"interval\": 1800,
    \"timeout\": 30,
    \"alert_contacts\": \"${ALERT_EMAIL}\"
  }")

if echo "$RESPONSE" | grep -q '"stat":"ok"'; then
  echo "  ✅ Forecast freshness monitor created"
else
  echo "  ⚠️ Forecast freshness response: $RESPONSE"
fi

# Monitor 4: ML Prediction Endpoint
echo "  Creating ML prediction monitor..."
RESPONSE=$(curl -s -X POST "https://api.uptimerobot.com/v2/newMonitor" \
  -H "Content-Type: application/json" \
  -d "{
    \"api_key\": \"${UPTIMEROBOT_API_KEY}\",
    \"friendly_name\": \"HazardNet ML Prediction API\",
    \"url\": \"${PRODUCTION_URL}/api/metrics\",
    \"type\": 2,
    \"sub_type\": 2,
    \"keyword_type\": 1,
    \"keyword_value\": \"hazardnet_predictions_total\",
    \"interval\": 600,
    \"timeout\": 30,
    \"alert_contacts\": \"${ALERT_EMAIL}\"
  }")

if echo "$RESPONSE" | grep -q '"stat":"ok"'; then
  echo "  ✅ ML prediction monitor created"
else
  echo "  ⚠️ ML prediction response: $RESPONSE"
fi

echo ""
echo "✅ UptimeRobot monitors configured"
echo ""

# ==========================================
# 4. Verify Setup
# ==========================================
echo "🔍 Verifying monitoring setup..."

# Check Grafana dashboard is accessible
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${GRAFANA_API_KEY}" \
  "${GRAFANA_URL}/api/dashboards/uid/${DASHBOARD_UID}")

if [ "$HTTP_CODE" -eq 200 ]; then
  echo "  ✅ Grafana dashboard accessible"
else
  echo "  ⚠️ Grafana dashboard returned HTTP $HTTP_CODE"
fi

# Check Prometheus metrics endpoint
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${PRODUCTION_URL}/api/metrics")
if [ "$HTTP_CODE" -eq 200 ]; then
  echo "  ✅ Prometheus metrics endpoint accessible"
else
  echo "  ⚠️ Metrics endpoint returned HTTP $HTTP_CODE"
fi

# List UptimeRobot monitors
MONITORS=$(curl -s -X POST "https://api.uptimerobot.com/v2/getMonitors" \
  -H "Content-Type: application/json" \
  -d "{\"api_key\": \"${UPTIMEROBOT_API_KEY}\"}" | jq -r '.monitors | length')

if [ "$MONITORS" -ge 4 ]; then
  echo "  ✅ UptimeRobot monitors active: $MONITORS"
else
  echo "  ⚠️ Expected at least 4 monitors, found: $MONITORS"
fi

echo ""
echo "=========================================="
echo "✅ Monitoring Setup Complete!"
echo "=========================================="
echo ""
echo "📊 Grafana Dashboard: ${GRAFANA_URL}${DASHBOARD_URL}"
echo "⏰ UptimeRobot: https://uptimerobot.com/dashboard"
echo "📧 Alerts will be sent to: ${ALERT_EMAIL}"
echo ""
echo "Next steps:"
echo "  1. Review Grafana dashboard and adjust alert thresholds"
echo "  2. Test UptimeRobot alerts by pausing a monitor"
echo "  3. Configure Slack/PagerDuty integrations if needed"
echo ""
