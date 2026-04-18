#!/bin/bash
# OCNMPS Configuration Chain Verification
# Validates consistency across config sources
#
# Usage: ./verify_config_chain.sh [plugin_dir]
#   plugin_dir: path to ocnmps-router plugin (default: current directory)

set -e

PLUGIN_DIR="${1:-.}"
CONFIG_FILE="$PLUGIN_DIR/config/ocnmps_plugin_config.json"
PLUGIN_FILE="$PLUGIN_DIR/src/plugin.js"
OPENCLAW_CONFIG="${OPENCLAW_CONFIG:-$HOME/.openclaw/openclaw.json}"

echo "=== OCNMPS Config Chain Verification ==="
echo ""
echo "Plugin dir: $PLUGIN_DIR"
echo ""

# 1. Check local config
echo "1. Local Config (config/ocnmps_plugin_config.json)"
if [ -f "$CONFIG_FILE" ]; then
    LOCAL_GRAY=$(cat "$CONFIG_FILE" | jq -r '.grayRatio // "null"')
    LOCAL_MODE=$(cat "$CONFIG_FILE" | jq -r '.rolloutMode // "null"')
    echo "   grayRatio: $LOCAL_GRAY"
    echo "   rolloutMode: $LOCAL_MODE"
    echo "   ✅ Config file found"
else
    echo "   ⚠️  Config file not found at $CONFIG_FILE"
    echo "   Create one from config/example.json"
fi
echo ""

# 2. Check code references
echo "2. Code Reference Check (src/plugin.js)"
if [ -f "$PLUGIN_FILE" ]; then
    LOAD_CONFIG_CALLS=$(grep -c "loadConfig" "$PLUGIN_FILE" 2>/dev/null || echo "0")
    echo "   loadConfig() references: $LOAD_CONFIG_CALLS"
    echo "   ✅ Plugin source found"
else
    echo "   ⚠️  src/plugin.js not found"
fi
echo ""

# 3. Check Gateway config (if OpenClaw is installed)
echo "3. Gateway Config (openclaw.json)"
if [ -f "$OPENCLAW_CONFIG" ]; then
    GATEWAY_GRAY=$(cat "$OPENCLAW_CONFIG" | jq -r '.plugins.entries["ocnmps-router"].config.grayRatio // "null"' 2>/dev/null)
    GATEWAY_ENABLED=$(cat "$OPENCLAW_CONFIG" | jq -r '.plugins.entries["ocnmps-router"].enabled // "null"' 2>/dev/null)
    echo "   grayRatio: $GATEWAY_GRAY"
    echo "   enabled: $GATEWAY_ENABLED"
    if [ "$GATEWAY_GRAY" = "null" ]; then
        echo "   ℹ️  Not configured in Gateway, using local config"
    else
        echo "   ✅ Configured in Gateway"
    fi
else
    echo "   ℹ️  openclaw.json not found (skipping Gateway check)"
fi
echo ""

# 4. Consistency check
echo "=== Consistency Check ==="
if [ -f "$CONFIG_FILE" ] && [ "$GATEWAY_GRAY" != "null" ] && [ "$GATEWAY_GRAY" != "$LOCAL_GRAY" ]; then
    echo "⚠️  WARNING: Gateway ($GATEWAY_GRAY) differs from local ($LOCAL_GRAY)"
    echo "   Precedence: Gateway > local config > default"
    echo "   Effective value will be: $GATEWAY_GRAY"
elif [ "$GATEWAY_GRAY" = "null" ] && [ -f "$CONFIG_FILE" ]; then
    echo "ℹ️  Gateway not configured. Using local config: grayRatio=$LOCAL_GRAY"
elif [ -f "$CONFIG_FILE" ]; then
    echo "✅ Config consistent: grayRatio=$GATEWAY_GRAY"
fi
echo ""

echo "=== Verification Complete ==="
