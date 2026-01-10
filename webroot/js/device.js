// device.js - Device Detection and Parsing

// --- Detection Logic ---
async function getDevice() {
    try {
        const uname = await exec('uname -r');
        if (!uname) return null;

        // Simple detection logic
        let schemaKey = 'features_1280'; // Default
        if (uname.includes('4.14') || uname.includes('trinket')) {
            schemaKey = 'features_trinket';
        } else if (uname.includes('5.10') || uname.includes('s5e8825')) {
            schemaKey = 'features_1280';
        }

        return {
            uname: uname,
            schemaKey: schemaKey
        };
    } catch (e) {
        console.error("Device detection failed:", e);
        return null;
    }
}

// --- Module Prop Parsing ---
async function getModuleProps() {
    try {
        const propContent = await exec('cat /data/adb/modules/floppy_companion/module.prop');
        const props = {};
        if (propContent) {
            propContent.split('\n').forEach(line => {
                const parts = line.split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const val = parts.slice(1).join('=').trim();
                    props[key] = val;
                }
            });
        }
        return props;
    } catch (e) {
        console.error("Failed to read module.prop", e);
        return {};
    }
}

// --- Device Info Resolution ---
async function resolveDeviceInfo(unameOverride) {
    let deviceName = null;
    let deviceModel = null;
    let isTrinketMi = false;
    let is1280 = false;
    let isFloppyKernel = false;

    // Try to read device info
    const namePaths = [
        '/sys/kernel/sec_detect/device_name',
        '/sys/mi_detect/device_name'
    ];
    const modelPaths = [
        '/sys/kernel/sec_detect/device_model',
        '/sys/mi_detect/device_model'
    ];

    for (const path of namePaths) {
        deviceName = await exec(`cat ${path}`);
        if (deviceName) break;
    }
    for (const path of modelPaths) {
        deviceModel = await exec(`cat ${path}`);
        if (deviceModel) break;
    }

    // Fallback if deviceName is missing but we know the kernel
    if (!deviceName) {
        const uname = unameOverride || await exec('uname -r');
        if (uname) {
            if (uname.includes('trinket')) {
                deviceName = 'ginkgo';
                deviceModel = 'Trinket Device';
                isTrinketMi = true;
            } else if (uname.includes('s5e8825')) {
                deviceName = 'a25x';
                is1280 = true;
            }
        }
    }

    if (deviceName) {
        // Theme & Identification Logic
        const TRINKET_DEVICES = ['ginkgo', 'willow', 'sm6125', 'trinket', 'laurel_sprout'];
        const deviceCode = (deviceName || '').toLowerCase();

        isTrinketMi = isTrinketMi || TRINKET_DEVICES.some(code => deviceCode.includes(code));
        is1280 = is1280 || window.FLOPPY1280_DEVICES.includes(deviceName);
    }

    return {
        name: deviceName || 'Unknown',
        model: deviceModel,
        displayName: deviceModel ? `${deviceModel} (${deviceName})` : (deviceName || 'Unknown'),
        isTrinketMi: isTrinketMi,
        is1280: is1280,
    };
}
