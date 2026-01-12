#!/system/bin/sh
# Undervolt Tweak Backend Script (Floppy1280 only)

DATA_DIR="/data/adb/floppy_companion"
CONFIG_FILE="$DATA_DIR/config/undervolt.conf"

NODE_LITTLE="/sys/kernel/exynos_uv/cpucl0_uv_percent"
NODE_BIG="/sys/kernel/exynos_uv/cpucl1_uv_percent"
NODE_GPU="/sys/kernel/exynos_uv/gpu_uv_percent"

# Check if undervolt control is available
is_available() {
    # Check if ANY of the nodes exist (partial support logic)
    if [ -f "$NODE_LITTLE" ] || [ -f "$NODE_BIG" ] || [ -f "$NODE_GPU" ]; then
        echo "available=1"
    else
        echo "available=0"
    fi
}

# Get current values
get_current() {
    # If nodes don't exist, return 0 for all
    if [ ! -e "$NODE_LITTLE" ]; then
        echo "little=0"
        echo "big=0"
        echo "gpu=0"
        return
    fi
    
    local little=$(cat "$NODE_LITTLE" 2>/dev/null || echo "0")
    local big=$(cat "$NODE_BIG" 2>/dev/null || echo "0")
    local gpu=$(cat "$NODE_GPU" 2>/dev/null || echo "0")
    
    echo "little=$little"
    echo "big=$big"
    echo "gpu=$gpu"
}

# Get saved config
get_saved() {
    if [ -f "$CONFIG_FILE" ]; then
        cat "$CONFIG_FILE"
    else
        echo "little=0"
        echo "big=0"
        echo "gpu=0"
    fi
}

# Save config
save() {
    local little="$1"
    local big="$2"
    local gpu="$3"
    
    # Sanitize inputs (ensure they are numbers)
    [ -z "$little" ] && little="0"
    [ -z "$big" ] && big="0"
    [ -z "$gpu" ] && gpu="0"
    
    mkdir -p "$(dirname "$CONFIG_FILE")"
    cat > "$CONFIG_FILE" << EOF
little=$little
big=$big
gpu=$gpu
EOF
    echo "saved"
}

# Apply settings
apply() {
    local little="$1"
    local big="$2"
    local gpu="$3"
    
    if [ ! -e "$NODE_LITTLE" ]; then
        echo "error: undervolt nodes not found"
        return 1
    fi
    
    # Apply Little
    if [ -n "$little" ]; then
        echo "$little" > "$NODE_LITTLE" 2>/dev/null
    fi
    
    # Apply Big
    if [ -n "$big" ]; then
        echo "$big" > "$NODE_BIG" 2>/dev/null
    fi
    
    # Apply GPU
    if [ -n "$gpu" ]; then
        echo "$gpu" > "$NODE_GPU" 2>/dev/null
    fi
    
    echo "applied"
}

# Apply saved config (called at boot)
apply_saved() {
    if [ ! -f "$CONFIG_FILE" ]; then
        return 0
    fi
    
    local little=$(grep '^little=' "$CONFIG_FILE" | cut -d= -f2)
    local big=$(grep '^big=' "$CONFIG_FILE" | cut -d= -f2)
    local gpu=$(grep '^gpu=' "$CONFIG_FILE" | cut -d= -f2)
    
    apply "$little" "$big" "$gpu"
}

# Clear saved config (for when Overclock is enabled)
clear_saved() {
    if [ -f "$CONFIG_FILE" ]; then
        rm "$CONFIG_FILE"
    fi
    echo "cleared"
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
        save "$2" "$3" "$4"
        ;;
    apply)
        apply "$2" "$3" "$4"
        ;;
    apply_saved)
        apply_saved
        ;;
    clear_saved)
        clear_saved
        ;;
    *)
        echo "usage: $0 {is_available|get_current|get_saved|save|apply|apply_saved|clear_saved}"
        exit 1
        ;;
esac
