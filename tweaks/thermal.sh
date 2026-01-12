#!/system/bin/sh
# Thermal Modes Tweak Backend Script (Floppy1280 only)
# Only affects the Big cluster

DATA_DIR="/data/adb/floppy_companion"
CONFIG_FILE="$DATA_DIR/config/thermal.conf"
THERMAL_NODE="/sys/devices/platform/10080000.BIG/thermal_mode"
CUSTOM_FREQ_NODE="/sys/devices/platform/10080000.BIG/emergency_frequency"

# Check if thermal control is available
is_available() {
    if [ -f "$THERMAL_NODE" ]; then
        echo "available=1"
    else
        echo "available=0"
    fi
}

# Get current thermal mode from kernel
get_current() {
    if [ ! -f "$THERMAL_NODE" ]; then
        echo "mode="
        echo "custom_freq="
        return
    fi
    
    local mode=$(cat "$THERMAL_NODE" 2>/dev/null || echo "")
    local custom_freq=""
    if [ -f "$CUSTOM_FREQ_NODE" ]; then
        custom_freq=$(cat "$CUSTOM_FREQ_NODE" 2>/dev/null || echo "")
    fi
    
    echo "mode=$mode"
    echo "custom_freq=$custom_freq"
}

# Get saved config
get_saved() {
    if [ -f "$CONFIG_FILE" ]; then
        cat "$CONFIG_FILE"
    else
        echo "mode="
        echo "custom_freq="
    fi
}

# Save config (does not apply)
save() {
    local mode="$1"
    local custom_freq="$2"
    
    mkdir -p "$(dirname "$CONFIG_FILE")"
    cat > "$CONFIG_FILE" << EOF
mode=$mode
custom_freq=$custom_freq
EOF
    echo "saved"
}

# Apply thermal mode immediately
apply() {
    local mode="$1"
    local custom_freq="$2"
    
    if [ ! -f "$THERMAL_NODE" ]; then
        echo "error: Thermal control not available"
        return 1
    fi
    
    # Set mode
    if [ -n "$mode" ]; then
        echo "$mode" > "$THERMAL_NODE" 2>/dev/null
    fi
    
    # Set custom frequency (only for mode 2)
    if [ "$mode" = "2" ] && [ -n "$custom_freq" ] && [ -f "$CUSTOM_FREQ_NODE" ]; then
        echo "$custom_freq" > "$CUSTOM_FREQ_NODE" 2>/dev/null
    fi
    
    echo "applied"
}

# Apply saved config (called at boot)
apply_saved() {
    if [ ! -f "$CONFIG_FILE" ]; then
        return 0
    fi
    
    local mode=$(grep '^mode=' "$CONFIG_FILE" | cut -d= -f2)
    local custom_freq=$(grep '^custom_freq=' "$CONFIG_FILE" | cut -d= -f2)
    
    if [ -n "$mode" ]; then
        apply "$mode" "$custom_freq"
    fi
}

# Main action handler
case "$1" in
    is_available)
        is_available
        ;;
    get_current)
        get_current
        ;;
    get_saved)
        get_saved
        ;;
    save)
        save "$2" "$3"
        ;;
    apply)
        apply "$2" "$3"
        ;;
    apply_saved)
        apply_saved
        ;;
    *)
        echo "usage: $0 {is_available|get_current|get_saved|save|apply|apply_saved}"
        exit 1
        ;;
esac
