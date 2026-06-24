/**
 * VNCCS Pose Studio - Combined mesh editor and multi-pose generator
 * 
 * Combines Character Studio sliders, pose editing, and IK smart dragging.
 * 
 * Version: 2025-02-18-002
 */

import { app, api } from "/static/js/vnccs-standalone-module.js";

// Determine the extension's base URL dynamically to support varied directory names (e.g. ComfyUI_VNCCS_Utils_JPAI or vnccs-utils)
const EXTENSION_URL = new URL(".", import.meta.url).toString();
const POSE_STUDIO_UI_ZOOM = 0.85;
const DEFAULT_CAMERA_ZOOM = 1.0;
const CAMERA_VIEW_SCALE = 1.18;
const EDITOR_VIEW_DOLLY_SCALE = 1.25;
const CAMERA_1K_RESOLUTIONS = [
    { label: "1:1 方图 - 1024×1024", width: 1024, height: 1024 },
    { label: "2:3 竖图 - 1024×1536", width: 1024, height: 1536 },
    { label: "3:4 竖图 - 1008×1344", width: 1008, height: 1344 },
    { label: "9:16 竖屏 - 720×1280", width: 720, height: 1280 },
    { label: "4:3 横图 - 1344×1008", width: 1344, height: 1008 },
    { label: "3:2 横图 - 1536×1024", width: 1536, height: 1024 },
    { label: "16:9 宽屏 - 1280×720", width: 1280, height: 720 }
];

// === Three.js Module Loader (from Debug3) ===
const THREE_VERSION = "0.160.0";
const THREE_SOURCES = {
    core: "/static/vendor/js/vnccs/three.module.js",
    orbit: "/static/vendor/js/vnccs/OrbitControls.js",
    transform: "/static/vendor/js/vnccs/TransformControls.js"
};

const ThreeModuleLoader = {
    promise: null,
    async load() {
        if (!this.promise) {
            this.promise = Promise.all([
                import(THREE_SOURCES.core),
                import(THREE_SOURCES.orbit),
                import(THREE_SOURCES.transform)
            ]).then(([core, orbit, transform]) => ({
                THREE: core,
                OrbitControls: orbit.OrbitControls,
                TransformControls: transform.TransformControls
            }));
        }
        return this.promise;
    }
};

// === Styles ===
const STYLES = `
/* ===== VNCCS Pose Studio Theme ===== */
:root {
    --ps-bg: #1e1e1e;
    --ps-panel: #252525;
    --ps-border: #333;
    --ps-accent: #3558c7;
    --ps-accent-hover: #4264d9;
    --ps-success: #2e7d32;
    --ps-danger: #d32f2f;
    --ps-text: #e0e0e0;
    --ps-text-muted: #888;
    --ps-input-bg: #151515;
    --ps-ui-zoom: ${POSE_STUDIO_UI_ZOOM};
}

/* Main Container */
.vnccs-pose-studio {
    display: flex;
    flex-direction: row;
    width: 100%;
    height: 100%;
    background: var(--ps-bg);
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 12px;
    color: var(--ps-text);
    overflow: hidden;
    box-sizing: border-box;
    zoom: var(--ps-ui-zoom);
    pointer-events: none;
    position: relative;
}

/* === Left Panel (25%) === */
.vnccs-ps-left {
    width: 250px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    overflow-y: auto;
    border-right: 1px solid var(--ps-border);
    pointer-events: auto;
}

/* Scrollbar */
.vnccs-ps-left::-webkit-scrollbar { width: 6px; }
.vnccs-ps-left::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }

/* === Center Panel (Canvas) === */
.vnccs-ps-center {
    flex: 1;
    min-width: 400px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    pointer-events: auto;
}

/* === Right Sidebar (Lighting) === */
.vnccs-ps-right-sidebar {
    width: 320px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    overflow-y: auto;
    border-left: 1px solid var(--ps-border);
    pointer-events: auto;
    background: var(--ps-bg);
}

.vnccs-ps-right-sidebar::-webkit-scrollbar { width: 6px; }
.vnccs-ps-right-sidebar::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }

/* === Section Component === */
.vnccs-ps-section {
    background: var(--ps-panel);
    border: 1px solid var(--ps-border);
    border-radius: 6px;
    overflow: hidden;
    flex-shrink: 0;
}

.vnccs-ps-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    background: #1a1a1a;
    border-bottom: 1px solid var(--ps-border);
    cursor: pointer;
    user-select: none;
}

.vnccs-ps-section-title {
    font-size: 11px;
    font-weight: bold;
    color: #fff;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.vnccs-ps-section-toggle {
    font-size: 10px;
    color: var(--ps-text-muted);
    transition: transform 0.2s;
}

.vnccs-ps-section.collapsed .vnccs-ps-section-toggle {
    transform: rotate(-90deg);
}

.vnccs-ps-section-content {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: auto;
}

.vnccs-ps-section.collapsed .vnccs-ps-section-content {
    display: none;
}

/* === Form Fields === */
.vnccs-ps-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    pointer-events: auto;
}

.vnccs-ps-label {
    font-size: 10px;
    color: var(--ps-text-muted);
    text-transform: uppercase;
    font-weight: 600;
}

.vnccs-ps-value {
    font-size: 10px;
    color: var(--ps-accent);
    margin-left: auto;
}

.vnccs-ps-label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

/* Slider */
.vnccs-ps-slider-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--ps-input-bg);
    border: 1px solid var(--ps-border);
    border-radius: 4px;
    padding: 4px 8px;
    pointer-events: auto;
}

.vnccs-ps-slider {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    background: #333;
    border-radius: 2px;
    cursor: pointer;
    pointer-events: auto;
}

.vnccs-ps-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    background: var(--ps-accent);
    border-radius: 50%;
    cursor: pointer;
}

.vnccs-ps-slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    background: var(--ps-accent);
    border-radius: 50%;
    cursor: pointer;
    border: none;
}

.vnccs-ps-slider-val {
    width: 40px;
    text-align: right;
    font-size: 11px;
    color: #fff;
    background: transparent;
    border: none;
    font-family: inherit;
}

/* Input */
.vnccs-ps-input {
    background: var(--ps-input-bg);
    border: 1px solid var(--ps-border);
    color: #fff;
    border-radius: 4px;
    padding: 6px 8px;
    font-family: inherit;
    font-size: 11px;
    width: 100%;
    box-sizing: border-box;
}

.vnccs-ps-input:focus {
    outline: none;
    border-color: var(--ps-accent);
}

/* Select */
.vnccs-ps-select {
    background: var(--ps-input-bg);
    border: 1px solid var(--ps-border);
    color: #fff;
    border-radius: 4px;
    padding: 6px 8px;
    font-family: inherit;
    font-size: 11px;
    width: 100%;
    cursor: pointer;
}

/* Counter-zoom for select dropdown options */
.vnccs-ps-select:focus {
    transform: scale(1.49);
    transform-origin: top left;
}

/* Gender Toggle */
.vnccs-ps-toggle {
    display: flex;
    gap: 2px;
    background: var(--ps-input-bg);
    border-radius: 4px;
    padding: 2px;
    border: 1px solid var(--ps-border);
}

.vnccs-ps-toggle-btn {
    flex: 1;
    border: none;
    padding: 6px 12px;
    cursor: pointer;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 600;
    font-family: inherit;
    transition: all 0.15s;
    background: transparent;
    color: var(--ps-text-muted);
}

.vnccs-ps-toggle-btn.active {
    color: white;
}

.vnccs-ps-toggle-btn.male.active {
    background: #4a90e2;
}

.vnccs-ps-toggle-btn.female.active {
    background: #e24a90;
}

.vnccs-ps-toggle-btn.list.active {
    background: #20a0a0;
}

.vnccs-ps-toggle-btn.grid.active {
    background: #e0a020;
}

/* Input Row */
.vnccs-ps-row {
    display: flex;
    gap: 8px;
}

.vnccs-ps-row > * {
    flex: 1;
}

/* Color Picker */
.vnccs-ps-color {
    width: 100%;
    height: 28px;
    border: 1px solid var(--ps-border);
    border-radius: 4px;
    cursor: pointer;
    padding: 0;
    background: none;
}

.vnccs-ps-reset-btn {
    width: 20px;
    height: 20px;
    background: transparent;
    border: 1px solid var(--ps-border);
    color: var(--ps-text-muted);
    border-radius: 3px;
    cursor: pointer;
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: all 0.15s;
}

.vnccs-ps-reset-btn:hover {
    color: var(--ps-accent);
    border-color: var(--ps-accent);
    background: rgba(255, 255, 255, 0.05);
}

/* Lighting UI Styles */
/* Lighting UI Styles (Reworked) */
.vnccs-ps-light-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 20px;
    padding-right: 4px;
    padding-bottom: 10px;
}

/* Light Card */
.vnccs-ps-light-card {
    background: linear-gradient(135deg, #252525 0%, #1e1e1e 100%);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    transition: all 0.2s;
}
.vnccs-ps-light-card:hover {
    border-color: rgba(255,255,255,0.15);
    box-shadow: 0 6px 16px rgba(0,0,0,0.3);
    transform: translateY(-1px);
}

/* Header */
.vnccs-ps-light-header {
    background: rgba(255,255,255,0.03);
    padding: 10px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(255,255,255,0.05);
}
.vnccs-ps-light-title {
    font-weight: 600;
    font-size: 11px;
    color: #eee;
    display: flex;
    align-items: center;
    gap: 8px;
}
.vnccs-ps-light-icon {
    font-size: 14px;
    opacity: 0.8;
}

/* Remove Button */
.vnccs-ps-light-remove {
    width: 24px;
    height: 24px;
    border-radius: 4px;
    background: transparent;
    color: #666;
    border: 1px solid transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    transition: all 0.2s;
    padding: 0;
}
.vnccs-ps-light-remove:hover {
    background: rgba(210, 50, 50, 0.1);
    color: #ff5555;
    border-color: rgba(210, 50, 50, 0.3);
}

/* Body */
.vnccs-ps-light-body {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

/* Controls Grid */
.vnccs-ps-light-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    align-items: center;
}

/* Input Styles */
.vnccs-ps-light-select {
    width: 100%;
    background: #151515;
    border: 1px solid #333;
    border-radius: 4px;
    color: #ccc;
    font-size: 11px;
    padding: 4px 6px;
    font-family: inherit;
    cursor: pointer;
}
.vnccs-ps-light-select:focus { border-color: var(--ps-accent); outline: none; }

.vnccs-ps-light-color {
    width: 100%;
    height: 24px;
    border: 1px solid #333;
    border-radius: 4px;
    padding: 0;
    cursor: pointer;
    background: none;
}

/* Sliders */
.vnccs-ps-light-slider-row {
    display: flex;
    align-items: center;
    gap: 8px;
}
.vnccs-ps-light-slider {
    flex: 1;
    height: 4px;
    background: #333;
    border-radius: 2px;
    -webkit-appearance: none;
}
.vnccs-ps-light-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--ps-accent);
    cursor: pointer;
    box-shadow: 0 0 0 2px rgba(0,0,0,0.2);
}

/* Position Grid */
.vnccs-ps-light-pos-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 10px;
    align-items: center;
    background: rgba(0,0,0,0.2);
    padding: 8px;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.03);
}
.vnccs-ps-light-pos-label {
    font-size: 10px;
    color: #888;
    font-weight: bold;
    width: 12px;
}
.vnccs-ps-light-value {
    width: 35px;
    flex-shrink: 0;
    text-align: right;
    font-size: 10px;
    color: #aaa;
}

/* Light Radar */
.vnccs-ps-light-radar-wrap {
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: rgba(0,0,0,0.3);
    padding: 10px;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.03);
}
.vnccs-ps-light-radar-main {
    display: flex;
    align-items: center;
    gap: 15px;
    justify-content: center;
    width: 100%;
}
.vnccs-ps-light-radar-canvas {
    border-radius: 50%;
    border: 1px solid #333;
    cursor: crosshair;
    background: #111;
    box-shadow: inset 0 0 10px rgba(0,0,0,0.5);
    flex-shrink: 0;
}
.vnccs-ps-light-slider-vert-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    height: 120px;
    width: 40px;
    flex-shrink: 0;
}
.vnccs-ps-light-slider-vert {
    -webkit-appearance: slider-vertical;
    appearance: slider-vertical;
    writing-mode: vertical-lr;
    direction: rtl;
    width: 6px;
    height: 80px;
    cursor: pointer;
    background: #333;
    margin: 0;
}
.vnccs-ps-light-slider-vert::-webkit-slider-runnable-track {
    background: transparent;
}
.vnccs-ps-light-slider-vert::-webkit-slider-thumb {
    width: 12px;
    height: 12px;
}
.vnccs-ps-light-h-val {
    font-size: 10px;
    color: #888;
    height: 12px;
    line-height: 12px;
    font-family: monospace;
}
.vnccs-ps-light-h-label {
    font-size: 9px;
    color: #555;
    font-weight: bold;
    height: 12px;
    line-height: 12px;
}



/* Large Add Btn */
.vnccs-ps-btn-add-large {
    width: 100%;
    padding: 10px;
    background: linear-gradient(to bottom, #2a2a2a, #222);
    border: 1px dashed #444;
    border-radius: 6px;
    color: #888;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
    margin-top: 5px;
}
.vnccs-ps-btn-add-large:hover {
    border-color: var(--ps-accent);
    color: var(--ps-accent);
    background: rgba(53, 88, 199, 0.05);
}

/* === 3D Canvas === */
.vnccs-ps-canvas-wrap {
    flex: 1;
    position: relative;
    overflow: hidden;
    background: #1a1a2e;
}

.vnccs-ps-canvas-wrap canvas {
    width: 100% !important;
    height: 100% !important;
    display: block;
}

/* === Action Bar === */
.vnccs-ps-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px; /* Reverted from 6px */
    padding: 8px 10px; /* Reverted from 6px 8px */
    background: #1a1a1a;
    border-top: 1px solid var(--ps-border);
    flex-shrink: 0;
}

.vnccs-ps-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 8px 14px; /* Reverted from 6px 12px */
    background: #333;
    border: 1px solid #444;
    border-radius: 4px;
    color: var(--ps-text);
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    font-family: inherit;
    transition: all 0.15s;
}

.vnccs-ps-btn:hover {
    background: #444;
    border-color: #555;
}

.vnccs-ps-btn.primary {
    background: var(--ps-accent);
    border-color: var(--ps-accent);
    color: white;
}

.vnccs-ps-btn.primary:hover {
    background: var(--ps-accent-hover);
}

.vnccs-ps-btn.danger {
    background: var(--ps-danger);
    border-color: var(--ps-danger);
    color: white;
}

.vnccs-ps-btn-icon {
    font-size: 14px;
}

/* === Modal Dialog === */
.vnccs-ps-modal-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    pointer-events: auto;
}

.vnccs-ps-modal {
    background: #222;
    border: 1px solid #444;
    border-radius: 8px;
    width: 340px;
    box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 0;
}

.vnccs-ps-actions .vnccs-ps-btn {
    flex: 1;
    min-width: 40px;
}

.vnccs-ps-modal-title {
    background: #2a2a2a;
    padding: 12px 16px;
    border-bottom: 1px solid #333;
    font-size: 14px;
    font-weight: 600;
    color: var(--ps-text);
    margin: 0;
}

.vnccs-ps-modal-content {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
}

.vnccs-ps-modal-btn {
    padding: 10px;
    border: 1px solid var(--ps-border);
    background: #333;
    color: var(--ps-text);
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    gap: 10px;
}

.vnccs-ps-modal-btn:hover {
    background: #444;
    border-color: var(--ps-accent);
}

.vnccs-ps-msg-modal {
    background: #222;
    border: 1px solid #444;
    border-radius: 8px;
    width: 340px;
    box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 0;
}

.vnccs-ps-modal-btn.cancel:hover {
    color: var(--ps-text);
    background: #333;
}

/* Modal Overlay */
.vnccs-ps-modal-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    pointer-events: auto;
    backdrop-filter: blur(4px);
}

/* === Loading Overlay === */
.vnccs-ps-loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    display: none;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 20px;
    z-index: 2000;
    color: white;
    cursor: wait;
}

.vnccs-ps-loading-spinner {
    width: 50px;
    height: 50px;
    border: 3px solid rgba(255, 255, 255, 0.1);
    border-top: 3px solid var(--ps-accent);
    border-radius: 50%;
    animation: ps-spin 1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    box-shadow: 0 0 15px rgba(53, 88, 199, 0.2);
}

@keyframes ps-spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.vnccs-ps-loading-text {
    font-size: 16px;
    font-weight: 500;
    letter-spacing: 1px;
    color: var(--ps-accent);
    text-transform: uppercase;
}

.vnccs-ps-ik-hint {
    position: absolute;
    bottom: 60px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.8);
    color: #ccc;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 11px;
    z-index: 100;
    pointer-events: none;
    white-space: nowrap;
}
`;

// Inject styles
const styleEl = document.createElement("style");
styleEl.textContent = STYLES;
document.head.appendChild(styleEl);


// === IK (Inverse Kinematics) System ===

/**
 * Human body IK chain definitions
 * Each chain defines the bones from root to end-effector
 */
const IK_CHAINS = {
    // Left arm chain: shoulder -> hand
    'left_arm': {
        bones: ['clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l'],
        endEffector: 'hand_l',
        poleTarget: 'elbow_l', // For elbow direction hint
        type: 'arm'
    },
    // Right arm chain
    'right_arm': {
        bones: ['clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r'],
        endEffector: 'hand_r',
        poleTarget: 'elbow_r',
        type: 'arm'
    },
    // Left leg chain
    'left_leg': {
        bones: ['thigh_l', 'calf_l', 'foot_l'],
        endEffector: 'foot_l',
        poleTarget: 'knee_l',
        type: 'leg'
    },
    // Right leg chain
    'right_leg': {
        bones: ['thigh_r', 'calf_r', 'foot_r'],
        endEffector: 'foot_r',
        poleTarget: 'knee_r',
        type: 'leg'
    },
    // Spine chain (for torso bending)
    'spine': {
        bones: ['pelvis', 'spine_01', 'spine_02', 'spine_03'],
        endEffector: 'spine_03',
        type: 'spine'
    },
    // Head/neck chain
    'head': {
        bones: ['spine_03', 'neck_01', 'head'],
        endEffector: 'head',
        type: 'head'
    }
};

/**
 * Joint constraints for realistic human movement
 * Angles in radians
 */
const JOINT_CONSTRAINTS = {
    // Elbow - hinge joint (single axis rotation)
    // Allow slight movement on other axes for natural poses
    'lowerarm_l': {
        type: 'hinge',
        axis: 'x',       // Primary rotation axis
        min: -0.1,       // Slight hyperextension allowed
        max: 2.6,        // ~149 degrees max bend
        twistMin: -1.57, // Forearm rotation
        twistMax: 1.57
    },
    'lowerarm_r': {
        type: 'hinge',
        axis: 'x',
        min: -0.1,
        max: 2.6,
        twistMin: -1.57,
        twistMax: 1.57
    },
    // Knee - hinge joint (more restrictive)
    'calf_l': {
        type: 'hinge',
        axis: 'x',
        min: -0.1,       // Slight hyperextension
        max: 2.7,        // ~155 degrees for deep squat
        twistMin: -0.2,
        twistMax: 0.2
    },
    'calf_r': {
        type: 'hinge',
        axis: 'x',
        min: -0.1,
        max: 2.7,
        twistMin: -0.2,
        twistMax: 0.2
    },
    // Shoulder - ball-socket joint (very flexible)
    'upperarm_l': {
        type: 'ball',
        coneAngle: 2.8,      // ~160 degrees - very flexible
        twistMin: -2.0,      // -115 degrees
        twistMax: 2.0,       // +115 degrees
        preferredAxis: [0, -1, 0]
    },
    'upperarm_r': {
        type: 'ball',
        coneAngle: 2.8,
        twistMin: -2.0,
        twistMax: 2.0,
        preferredAxis: [0, -1, 0]
    },
    // Hip - ball-socket joint (needs to allow leg raises)
    'thigh_l': {
        type: 'ball',
        coneAngle: 2.4,      // ~138 degrees - allows high kicks
        twistMin: -0.7,      // -40 degrees
        twistMax: 0.7,
        forwardLimit: 2.5,   // Leg can go forward more
        backLimit: 0.7       // Limited backward movement
    },
    'thigh_r': {
        type: 'ball',
        coneAngle: 2.4,
        twistMin: -0.7,
        twistMax: 0.7,
        forwardLimit: 2.5,
        backLimit: 0.7
    },
    // Wrist - limited ball joint
    'hand_l': {
        type: 'limited_ball',
        coneAngle: 1.5,      // ~86 degrees overall
        flexMin: -1.4,       // -80 degrees
        flexMax: 1.4,
        deviationMin: -0.5,  // -29 degrees
        deviationMax: 0.5,
        twistMin: -1.8,
        twistMax: 1.8
    },
    'hand_r': {
        type: 'limited_ball',
        coneAngle: 1.5,
        flexMin: -1.4,
        flexMax: 1.4,
        deviationMin: -0.5,
        deviationMax: 0.5,
        twistMin: -1.8,
        twistMax: 1.8
    },
    // Ankle - needs flexibility for poses
    'foot_l': {
        type: 'limited_ball',
        coneAngle: 1.2,
        flexMin: -1.0,       // -57 degrees (plantarflexion) - point toes
        flexMax: 0.7,        // +40 degrees (dorsiflexion)
        deviationMin: -0.5,
        deviationMax: 0.5,
        twistMin: -0.4,
        twistMax: 0.4
    },
    'foot_r': {
        type: 'limited_ball',
        coneAngle: 1.2,
        flexMin: -1.0,
        flexMax: 0.7,
        deviationMin: -0.5,
        deviationMax: 0.5,
        twistMin: -0.4,
        twistMax: 0.4
    },
    // Spine segments - more flexible for natural poses
    'spine_01': {
        type: 'spine',
        maxBend: 0.35,       // ~20 degrees per segment
        maxTwist: 0.26       // ~15 degrees
    },
    'spine_02': {
        type: 'spine',
        maxBend: 0.35,
        maxTwist: 0.26
    },
    'spine_03': {
        type: 'spine',
        maxBend: 0.44,
        maxTwist: 0.35
    },
    // Neck - flexible
    'neck_01': {
        type: 'spine',
        maxBend: 0.7,        // ~40 degrees
        maxTwist: 1.0        // ~57 degrees
    },
    // Head
    'head': {
        type: 'spine',
        maxBend: 0.52,
        maxTwist: 1.0
    },
    // Clavicle (limited movement but allows shoulder shrug)
    'clavicle_l': {
        type: 'clavicle',
        elevationMin: -0.26, // ~15 degrees down
        elevationMax: 0.7,   // ~40 degrees up
        protractionMax: 0.35 // ~20 degrees forward
    },
    'clavicle_r': {
        type: 'clavicle',
        elevationMin: -0.26,
        elevationMax: 0.7,
        protractionMax: 0.35
    }
};

const VNCCS_GAME_ENGINE_MARKER_NAMES = [
    'Root',
    'ball_l', 'ball_r',
    'calf_l', 'calf_r',
    'clavicle_l', 'clavicle_r',
    'foot_l', 'foot_r',
    'hand_l', 'hand_r',
    'head',
    'index_01_l', 'index_01_r',
    'index_02_l', 'index_02_r',
    'index_03_l', 'index_03_r',
    'lowerarm_l', 'lowerarm_r',
    'middle_01_l', 'middle_01_r',
    'middle_02_l', 'middle_02_r',
    'middle_03_l', 'middle_03_r',
    'neck_01',
    'pelvis',
    'pinky_01_l', 'pinky_01_r',
    'pinky_02_l', 'pinky_02_r',
    'pinky_03_l', 'pinky_03_r',
    'ring_01_l', 'ring_01_r',
    'ring_02_l', 'ring_02_r',
    'ring_03_l', 'ring_03_r',
    'spine_01', 'spine_02', 'spine_03',
    'thigh_l', 'thigh_r',
    'thumb_01_l', 'thumb_01_r',
    'thumb_02_l', 'thumb_02_r',
    'thumb_03_l', 'thumb_03_r',
    'upperarm_l', 'upperarm_r'
];
const VNCCS_GAME_ENGINE_MARKER_COUNT = VNCCS_GAME_ENGINE_MARKER_NAMES.length;

const SAM3D_CANONICAL_MARKER_NAMES = new Set(VNCCS_GAME_ENGINE_MARKER_NAMES);

function displayBoneName(bone) {
    return bone?.userData?.semanticName || bone?.name || '';
}

/**
 * CCD (Cyclic Coordinate Descent) IK Solver
 * More intuitive and reliable for skeletal animation than FABRIK
 * Directly calculates rotations instead of positions
 */
class CCDIKSolver {
    constructor(THREE) {
        this.THREE = THREE;
        this.tolerance = 0.01;      // Position tolerance
        this.maxIterations = 15;    // More iterations for better convergence
        this.dampingFactor = 0.8;   // Damping to prevent overshooting
    }

    /**
     * Solve IK using CCD algorithm
     * @param {Array} bones - Array of Three.js Bone objects (from root to end-effector)
     * @param {Vector3} targetPos - Target world position for end effector
     * @param {Object} options - Additional options
     * @returns {boolean} Whether solving was successful
     */
    solve(bones, targetPos, options = {}) {
        const THREE = this.THREE;
        const n = bones.length;
        if (n < 2) return false;

        const endEffector = bones[n - 1];
        const target = targetPos.clone();
        
        // Get initial end effector position
        const endPos = new THREE.Vector3();
        endEffector.getWorldPosition(endPos);
        
        let error = endPos.distanceTo(target);
        let iteration = 0;

        // Store original rotations for potential rollback
        const originalRotations = bones.map(b => b.rotation.clone());

        while (error > this.tolerance && iteration < this.maxIterations) {
            // CCD: iterate from end-effector parent to root
            for (let i = n - 2; i >= 0; i--) {
                const bone = bones[i];
                
                // Get current positions
                const boneWorldPos = new THREE.Vector3();
                bone.getWorldPosition(boneWorldPos);
                
                endEffector.getWorldPosition(endPos);
                
                // Skip if bone is at the target position
                if (boneWorldPos.distanceTo(target) < 0.001) continue;
                
                // Vector from bone to end effector (current)
                const toEnd = new THREE.Vector3().subVectors(endPos, boneWorldPos);
                if (toEnd.lengthSq() < 0.0001) continue;
                toEnd.normalize();
                
                // Vector from bone to target (desired)
                const toTarget = new THREE.Vector3().subVectors(target, boneWorldPos);
                if (toTarget.lengthSq() < 0.0001) continue;
                toTarget.normalize();
                
                // Calculate rotation needed (in world space)
                const dot = Math.max(-1, Math.min(1, toEnd.dot(toTarget)));
                let angle = Math.acos(dot);
                
                // Skip tiny rotations
                if (angle < 0.0001) continue;
                
                // Apply damping
                angle *= this.dampingFactor;
                
                // Calculate rotation axis (in world space)
                const axis = new THREE.Vector3().crossVectors(toEnd, toTarget);
                if (axis.lengthSq() < 0.0001) {
                    // Vectors are parallel, pick arbitrary perpendicular axis
                    axis.set(toEnd.y, -toEnd.x, 0).normalize();
                    if (axis.lengthSq() < 0.0001) {
                        axis.set(0, toEnd.z, -toEnd.y).normalize();
                    }
                }
                axis.normalize();
                
                // Create world space rotation
                const worldRotation = new THREE.Quaternion().setFromAxisAngle(axis, angle);
                
                // Convert to local space rotation
                const parentWorldQuat = new THREE.Quaternion();
                if (bone.parent) {
                    bone.parent.getWorldQuaternion(parentWorldQuat);
                }
                const invParentQuat = parentWorldQuat.clone().invert();
                
                // Transform axis to local space
                const localAxis = axis.clone().applyQuaternion(invParentQuat);
                const localRotation = new THREE.Quaternion().setFromAxisAngle(localAxis, angle);
                
                // Apply rotation to bone (multiply with existing rotation)
                const currentQuat = new THREE.Quaternion().setFromEuler(bone.rotation);
                const newQuat = currentQuat.clone().premultiply(localRotation);
                
                // Apply joint constraints if available
                const constraintName = displayBoneName(bone);
                const constraint = options.constraints
                    ? (options.constraints[constraintName] || options.constraints[bone.name])
                    : null;
                if (constraint) {
                    this.applyConstraint(bone, newQuat, constraint);
                } else {
                    bone.quaternion.copy(newQuat);
                }
                
                // Update matrices
                bone.updateMatrixWorld(true);
            }
            
            // Check new error
            endEffector.getWorldPosition(endPos);
            error = endPos.distanceTo(target);
            iteration++;
        }

        return error < this.tolerance * 10; // Allow some tolerance
    }

    /**
     * Apply joint constraint to quaternion
     */
    applyConstraint(bone, quaternion, constraint) {
        const THREE = this.THREE;
        
        // Convert to Euler for constraint checking
        const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
        
        switch (constraint.type) {
            case 'hinge':
                // Hinge joint - primarily single axis rotation
                if (constraint.axis === 'x') {
                    euler.x = Math.max(constraint.min || -Math.PI, Math.min(constraint.max || Math.PI, euler.x));
                    // Allow small rotation on other axes for natural movement
                    euler.y = Math.max(-0.3, Math.min(0.3, euler.y));
                    euler.z = Math.max(-0.3, Math.min(0.3, euler.z));
                } else if (constraint.axis === 'y') {
                    euler.y = Math.max(constraint.min || -Math.PI, Math.min(constraint.max || Math.PI, euler.y));
                    euler.x = Math.max(-0.3, Math.min(0.3, euler.x));
                    euler.z = Math.max(-0.3, Math.min(0.3, euler.z));
                } else if (constraint.axis === 'z') {
                    euler.z = Math.max(constraint.min || -Math.PI, Math.min(constraint.max || Math.PI, euler.z));
                    euler.x = Math.max(-0.3, Math.min(0.3, euler.x));
                    euler.y = Math.max(-0.3, Math.min(0.3, euler.y));
                }
                break;
                
            case 'ball':
            case 'limited_ball':
                // Ball-socket joint with cone limit
                const coneAngle = constraint.coneAngle || Math.PI * 0.75;
                const totalAngle = Math.sqrt(euler.x * euler.x + euler.z * euler.z);
                if (totalAngle > coneAngle) {
                    const scale = coneAngle / totalAngle;
                    euler.x *= scale;
                    euler.z *= scale;
                }
                // Apply twist limits
                if (constraint.twistMin !== undefined) {
                    euler.y = Math.max(constraint.twistMin, Math.min(constraint.twistMax || Math.PI, euler.y));
                }
                break;
                
            case 'spine':
                // Limited rotation on all axes
                const maxBend = constraint.maxBend || 0.4;
                const maxTwist = constraint.maxTwist || 0.4;
                euler.x = Math.max(-maxBend, Math.min(maxBend, euler.x));
                euler.y = Math.max(-maxTwist, Math.min(maxTwist, euler.y));
                euler.z = Math.max(-maxBend, Math.min(maxBend, euler.z));
                break;
        }
        
        // Convert back to quaternion
        bone.quaternion.setFromEuler(euler);
    }
}

/**
 * IK Controller - Manages IK solving for the human skeleton
 * Improved version with better chain handling and CCD solver
 */
class IKController {
    constructor(viewer) {
        this.viewer = viewer;
        this.THREE = null;
        this.solver = null;
        this.enabled = false;
        this.chainDepth = 3;        // Default to 3 bones for natural movement
        
        // IK target helper (visual)
        this.targetHelper = null;
        this.targetPosition = null;
        
        // Cache for rest pose
        this.restPoseCache = {};
    }

    init(THREE) {
        this.THREE = THREE;
        this.solver = new CCDIKSolver(THREE);
        
        // Create IK target helper (sphere)
        const geometry = new THREE.SphereGeometry(0.12, 16, 16);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.7,
            depthTest: false
        });
        this.targetHelper = new THREE.Mesh(geometry, material);
        this.targetHelper.visible = false;
        this.targetHelper.renderOrder = 1000;
    }

    /**
     * Get the IK chain for a bone (from ancestors to the bone)
     * @param {Bone} bone - The end effector bone
     * @param {number} depth - How many parent bones to include
     * @returns {Array} Array of bones from root to end effector
     */
    getChainForBone(bone, depth) {
        const chain = [bone];
        let current = bone;
        
        // Walk up the hierarchy
        for (let i = 0; i < depth - 1; i++) {
            if (current.parent && current.parent.isBone) {
                chain.unshift(current.parent);
                current = current.parent;
            } else {
                break;
            }
        }
        
        return chain;
    }

    /**
     * Find optimal chain depth based on bone type
     */
    getOptimalChainDepth(boneName) {
        const name = boneName.toLowerCase();
        
        // Fingers need shorter chains
        if (name.includes('finger') || name.includes('thumb') || name.includes('index') || 
            name.includes('middle') || name.includes('ring') || name.includes('pinky')) {
            return Math.min(this.chainDepth, 2);
        }
        
        // Hands/feet use specified chain depth
        if (name.includes('hand') || name.includes('foot')) {
            return this.chainDepth;
        }
        
        // Arms and legs
        if (name.includes('arm') || name.includes('leg') || name.includes('calf') || name.includes('thigh')) {
            return Math.min(this.chainDepth, 3);
        }
        
        return this.chainDepth;
    }

    /**
     * Solve IK when user drags a bone
     * @param {Object} bone - The bone being dragged
     * @param {Vector3} targetWorldPos - Target world position
     */
    solveForBone(bone, targetWorldPos) {
        if (!this.enabled || !this.solver || !bone) return false;

        const THREE = this.THREE;
        const boneName = displayBoneName(bone);
        
        // Determine chain depth based on bone type
        const effectiveDepth = this.getOptimalChainDepth(boneName);
        
        // Get the IK chain
        const chain = this.getChainForBone(bone, effectiveDepth);
        
        if (chain.length < 2) {
            return false;
        }

        // Build constraints map
        const constraints = {};
        for (const b of chain) {
            const constraintName = displayBoneName(b);
            if (JOINT_CONSTRAINTS[constraintName]) {
                constraints[constraintName] = JOINT_CONSTRAINTS[constraintName];
            }
        }

        // Solve IK
        const success = this.solver.solve(chain, targetWorldPos, { constraints });

        // Update target helper position
        if (this.targetHelper && this.viewer.scene) {
            this.targetHelper.position.copy(targetWorldPos);
            if (!this.targetHelper.parent) {
                this.viewer.scene.add(this.targetHelper);
            }
            this.targetHelper.visible = true;
        }

        // Force skeleton update
        if (this.viewer.skeleton) {
            this.viewer.skeleton.update();
        }
        
        this.viewer.requestRender();

        return success;
    }

    /**
     * Hide the IK target helper
     */
    hideTargetHelper() {
        if (this.targetHelper) {
            this.targetHelper.visible = false;
        }
    }

    /**
     * Enable/disable IK mode
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            this.hideTargetHelper();
        }
    }

    /**
     * Set chain depth (how many bones affected)
     */
    setChainDepth(depth) {
        this.chainDepth = Math.max(2, Math.min(5, depth));
    }

    /**
     * Dispose resources
     */
    dispose() {
        if (this.targetHelper) {
            if (this.targetHelper.parent) {
                this.targetHelper.parent.remove(this.targetHelper);
            }
            this.targetHelper.geometry.dispose();
            this.targetHelper.material.dispose();
            this.targetHelper = null;
        }
    }
}


// === 3D Viewer (from Debug3) ===
class PoseViewer {
    constructor(canvas) {
        this.canvas = canvas;
        this.width = 500;
        this.height = 500;

        this.THREE = null;
        this.OrbitControls = null;
        this.TransformControls = null;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.orbit = null;
        this.transform = null;

        this.skinnedMesh = null;
        this.skeleton = null;
        this.boneList = [];
        this.bones = {};
        this.selectedBone = null;

        this.jointMarkers = [];

        // Pose state
        this.modelRotation = { x: 0, y: 0, z: 0 };

        // Pose state
        this.modelRotation = { x: 0, y: 0, z: 0 };

        this.syncCallback = null;

        this.initialized = false;

        // Undo/Redo History
        this.history = [];
        this.future = [];
        this.maxHistory = 10;
        this.headScale = 1.0;

        // Managed lights array
        this.lights = [];
        this.pendingData = null;
        this.pendingLights = null;
        this.pendingBackgroundUrl = null;

        // IK (Inverse Kinematics) System
        this.ikController = null;
        this.ikMode = true;           // IK smart dragging is the only interaction mode
        this.ikChainDepth = 2;        // How many bones affected by IK
        this.ikDragging = false;      // Currently dragging in IK mode
        this.ikDragPlane = null;      // Drag plane for IK drag
        this.ikLastMousePos = null;   // Last mouse position for IK drag
        this.showGizmoInIK = false;   // Double-click a joint to show FK rotation controls.
        this.lastClickTime = 0;
    }

    async init() {
        try {
            const modules = await ThreeModuleLoader.load();
            this.THREE = modules.THREE;
            this.OrbitControls = modules.OrbitControls;
            this.TransformControls = modules.TransformControls;

            this.setupScene();

            // Initialize IK Controller
            this.ikController = new IKController(this);
            this.ikController.init(this.THREE);
            this.setIKMode(true);

            this.initialized = true;

            this.animate();

            // Apply buffered data after initialized=true
            if (this.pendingData) {
                this.loadData(this.pendingData.data, this.pendingData.keepCamera);
                this.pendingData = null;
            }

            if (this.pendingLights) {
                this.updateLights(this.pendingLights);
                this.pendingLights = null;
            }

            if (this.pendingBackgroundUrl) {
                this.loadReferenceImage(this.pendingBackgroundUrl);
                this.pendingBackgroundUrl = null;
            }

            this.requestRender(); // Initial render
        } catch (e) {
            console.error('Pose Studio: Init failed', e);
        }
    }

    setupScene() {
        const THREE = this.THREE;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);

        this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.1, 1000);
        this.camera.position.set(0, 10, 30);

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            preserveDrawingBuffer: true
        });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // Orbit Controls
        this.orbit = new this.OrbitControls(this.camera, this.canvas);
        this.orbit.target.set(0, 10, 0);
        this.orbit.enableDamping = true;
        this.orbit.dampingFactor = 0.12;
        this.orbit.rotateSpeed = 0.95;
        this.orbit.update();

        // Render on demand: orbit change triggers render
        this.orbit.addEventListener('change', () => this.requestRender());

        // Transform Controls (FK rotation gizmo). Hidden by default in IK smart mode;
        // double-clicking a joint reveals it for direct FK rotation.
        this.transform = new this.TransformControls(this.camera, this.canvas);
        this.transform.setMode("rotate");
        this.transform.setSpace("local");
        this.transform.setSize(0.8);
        this.transform.visible = false;
        this.transform.enabled = false;
        this.scene.add(this.transform);

        this.transform.addEventListener("dragging-changed", (e) => {
            this.orbit.enabled = !e.value;
            if (e.value) {
                this.recordState();
            } else {
                if (this.selectedBone) {
                    this.selectedBone.updateMatrixWorld(true);
                    if (this.skeleton) this.skeleton.update();
                }
                if (this.syncCallback) this.syncCallback();
            }
            this.requestRender();
        });

        this.transform.addEventListener("change", () => {
            if (this.selectedBone) {
                this.selectedBone.updateMatrixWorld(true);
                if (this.skeleton) this.skeleton.update();
            }
            this.requestRender();
        });

        // Lights - will be setup by updateLights() call from widget
        // Added default ambient light as a failsafe until widget lights load
        const defaultLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(defaultLight);
        this.lights = [defaultLight];

        // Capture Camera (Independent of Orbit camera)
        this.captureCamera = new THREE.PerspectiveCamera(30, this.width / this.height, 0.1, 100);
        this.scene.add(this.captureCamera);

        // Visual Helper - Orange Frame
        const frameGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-1, 1, 0), new THREE.Vector3(1, 1, 0),
            new THREE.Vector3(1, -1, 0), new THREE.Vector3(-1, -1, 0),
            new THREE.Vector3(-1, 1, 0)
        ]);
        this.captureFrame = new THREE.Line(frameGeo, new THREE.LineBasicMaterial({ color: 0xffa500, linewidth: 2 }));
        this.scene.add(this.captureFrame);
        this.captureFrame.visible = false;

        // Events
        this.canvas.addEventListener("pointerdown", (e) => this.handlePointerDown(e));
        this.canvas.addEventListener("dblclick", (e) => this.handleDblClick(e));

        // IK Mode: Mouse move and release handlers
        this.canvas.addEventListener("pointermove", (e) => {
            if (this.ikDragging) {
                this.handleIKDragMove(e);
            }
        });
        
        this.canvas.addEventListener("pointerup", (e) => {
            if (this.ikDragging) {
                this.endIKDrag();
            }
        });
        
        this.canvas.addEventListener("pointerleave", (e) => {
            if (this.ikDragging) {
                this.endIKDrag();
            }
        });
    }

    // === Light Management ===
    updateLights(lightParams) {
        if (!this.initialized || !this.THREE || !this.scene) {
            this.pendingLights = lightParams;
            return;
        }

        const THREE = this.THREE;
        if (!lightParams) return;

        // Remove existing managed lights
        if (this.lights && this.lights.length > 0) {
            for (const light of this.lights) {
                this.scene.remove(light);
                if (light.dispose) light.dispose();
            }
        }
        this.lights = [];

        // Failsafe: if no lights are provided, or all were removed, add a default ambient light
        // to prevent black silhouettes. 
        if (!lightParams || lightParams.length === 0) {
            const defaultLight = new THREE.AmbientLight(0xffffff, 0.5);
            this.scene.add(defaultLight);
            this.lights.push(defaultLight);
            return;
        }

        // Create new lights from params
        for (const params of lightParams) {
            // Handle both hex string (#ffffff) and legacy RGB array formats
            let color;
            if (typeof params.color === 'string') {
                color = new THREE.Color(params.color);
            } else if (Array.isArray(params.color)) {
                color = new THREE.Color(
                    params.color[0] / 255,
                    params.color[1] / 255,
                    params.color[2] / 255
                );
            } else {
                color = new THREE.Color(0xffffff);
            }

            let light;
            if (params.type === 'ambient') {
                light = new THREE.AmbientLight(color, params.intensity ?? 0.5);
            } else if (params.type === 'directional') {
                light = new THREE.DirectionalLight(color, params.intensity ?? 1.0);
                light.position.set(params.x ?? 1, params.y ?? 2, params.z ?? 3);
            } else if (params.type === 'point') {
                light = new THREE.PointLight(color, params.intensity ?? 1.0, params.radius ?? 100);
                light.position.set(params.x ?? 0, params.y ?? 0, params.z ?? 5);
            }

            if (light) {
                this.scene.add(light);
                this.lights.push(light);
            }
        }

        this.requestRender();
    }

    animate() {
        if (!this.initialized) return;

        // Damping requires continuous updates while active
        if (this.orbit.enableDamping) {
            this.orbit.update();
        }

        if (this._needsRender) {
            this._needsRender = false;
            if (this.renderer) this.renderer.render(this.scene, this.camera);
        }

        requestAnimationFrame(() => this.animate());
    }

    requestRender() {
        this._needsRender = true;
    }

    markerBoneIndex(marker) {
        const boneIndex = Number(marker?.userData?.boneIndex);
        return Number.isInteger(boneIndex) ? boneIndex : -1;
    }

    getMarkerSelectableBones() {
        const selectable = [];
        const seen = new Set();
        for (const marker of this.jointMarkers || []) {
            const boneIndex = this.markerBoneIndex(marker);
            if (boneIndex >= 0 && this.boneList[boneIndex] && !seen.has(boneIndex)) {
                seen.add(boneIndex);
                selectable.push(this.boneList[boneIndex]);
            }
        }
        return selectable;
    }

    isGenericDenseRig() {
        const bones = this.boneList || [];
        if (bones.length < 70) return false;
        const genericCount = bones.filter((bone) => /^joint[\s_.-]?\d+$/i.test(bone.name || '')).length;
        return genericCount / bones.length > 0.55;
    }

    getSam3dCanonicalMarkerBoneIndices() {
        const bones = this.boneList || [];
        const visible = new Set();
        if (!this.isGenericDenseRig()) return visible;
        let hasExplicitMarkers = false;
        for (let i = 0; i < bones.length; i++) {
            if (bones[i]?.userData?.showMarker === true) {
                visible.add(i);
                hasExplicitMarkers = true;
            }
        }
        if (hasExplicitMarkers) {
            return visible;
        }
        for (let i = 0; i < bones.length; i++) {
            const semanticName = String(bones[i]?.userData?.semanticName || '');
            if (SAM3D_CANONICAL_MARKER_NAMES.has(semanticName)) {
                visible.add(i);
            }
        }
        return visible;
    }

    getVisibleMarkerBoneIndices() {
        const bones = this.boneList || [];
        const visible = new Set();
        if (!bones.length) return visible;

        if (!this.isGenericDenseRig()) {
            bones.forEach((_, index) => visible.add(index));
            return visible;
        }

        const canonicalVisible = this.getSam3dCanonicalMarkerBoneIndices();
        canonicalVisible.forEach((index) => visible.add(index));
        return visible;
    }

    handlePointerDown(e) {
        if (!this.initialized || !this.skinnedMesh) return;
        if (e.button !== 0) return;

        if (this.transform?.dragging || this.transform?.axis) return;

        if (this.ikMode && this.showGizmoInIK && this.transform?.visible) {
            const rect = this.canvas.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            const raycaster = new this.THREE.Raycaster();
            raycaster.setFromCamera(new this.THREE.Vector2(x, y), this.camera);

            let clickedGizmo = false;
            this.transform.traverse((child) => {
                if (clickedGizmo || (!child.isMesh && !child.isLine)) return;
                const name = child.name || "";
                const isHandle = name.includes("X") || name.includes("Y") || name.includes("Z") || name.includes("E") || name.includes("R");
                if (isHandle && raycaster.intersectObject(child, false).length > 0) {
                    clickedGizmo = true;
                }
            });

            if (clickedGizmo) return;
        }

        const clickTime = Date.now();
        const isDoubleClick = (clickTime - this.lastClickTime) < 300;
        if (this.ikMode && isDoubleClick && !this.showGizmoInIK) {
            if (this.ikDragging) this.endIKDrag();
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        this.lastClickTime = clickTime;

        const rect = this.canvas.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        const raycaster = new this.THREE.Raycaster();
        raycaster.setFromCamera(new this.THREE.Vector2(x, y), this.camera);

        // --- PASS 1: Raycast against Joint Markers directly ---
        // Markers are spheres, very reliable targets.
        // recursive=false because markers are direct children of the scene (or in a flat array)
        const markerIntersects = raycaster.intersectObjects(this.jointMarkers, false);

        if (markerIntersects.length > 0) {
            // Sort by distance and pick the closest one
            markerIntersects.sort((a, b) => a.distance - b.distance);
            const hitMarker = markerIntersects[0].object;
            const boneIdx = this.markerBoneIndex(hitMarker);
            if (boneIdx !== -1 && this.boneList[boneIdx]) {
                const bone = this.boneList[boneIdx];
                this.selectBone(bone, this.showGizmoInIK);
                if (this.ikController && !this.showGizmoInIK) {
                    this.startIKDrag(bone, markerIntersects[0].point, e);
                }
                return;
            }
        }

        // --- PASS 2: Fallback to Mesh Intersect ---
        // Useful if user clicks on the body near a joint but misses the sphere.
        const meshIntersects = raycaster.intersectObject(this.skinnedMesh, true);

        if (meshIntersects.length > 0) {
            const point = meshIntersects[0].point;
            let nearest = null;
            let minD = Infinity;

            const wPos = new this.THREE.Vector3();
            const selectableBones = this.getMarkerSelectableBones();
            const bonesToCheck = selectableBones.length ? selectableBones : this.boneList;
            for (const b of bonesToCheck) {
                b.getWorldPosition(wPos);
                const d = point.distanceTo(wPos);
                if (d < minD) { minD = d; nearest = b; }
            }

            // Tighter threshold for mesh-based selection to avoid accidental jumps
            // when clicking overlapping parts.
            if (nearest && minD < 1.5) {
                this.selectBone(nearest, this.showGizmoInIK);
                if (this.ikController && !this.showGizmoInIK) {
                    this.startIKDrag(nearest, point, e);
                }
                return;
            }
        }

        // If nothing hit
        this.deselectBone();
        if (this.ikController) {
            this.ikController.hideTargetHelper();
        }
    }

    /**
     * Double-click a joint in IK smart mode to show FK rotation controls.
     */
    handleDblClick(e) {
        if (!this.initialized || !this.skinnedMesh || !this.ikMode) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        const raycaster = new this.THREE.Raycaster();
        raycaster.setFromCamera(new this.THREE.Vector2(x, y), this.camera);

        const markerIntersects = raycaster.intersectObjects(this.jointMarkers, false);
        if (markerIntersects.length > 0) {
            markerIntersects.sort((a, b) => a.distance - b.distance);
            const boneIdx = this.markerBoneIndex(markerIntersects[0].object);
            const bone = boneIdx !== -1 ? this.boneList[boneIdx] : null;
            if (bone) {
                if (this.ikDragging) this.endIKDrag();
                this.showGizmoInIK = true;
                this.selectBone(bone, true);
                this.lastClickTime = 0;
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        }

        this.showGizmoInIK = false;
        this.deselectBone();
    }

    /**
     * Start IK dragging for the selected bone
     */
    startIKDrag(bone, hitPoint, event) {
        if (!this.ikController || !this.ikMode) return;

        const THREE = this.THREE;
        
        // Record state for undo
        this.recordState();
        
        // Get bone world position
        const boneWorldPos = new THREE.Vector3();
        bone.getWorldPosition(boneWorldPos);
        
        // Create drag plane perpendicular to camera view direction
        const cameraDir = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDir);
        
        this.ikDragPlane = new THREE.Plane();
        this.ikDragPlane.setFromNormalAndCoplanarPoint(cameraDir.negate(), boneWorldPos);
        
        this.ikDragging = true;
        this.ikLastMousePos = { x: event.clientX, y: event.clientY };
        
        // Disable orbit controls during IK drag
        this.orbit.enabled = false;

        if (this.transform) {
            this.transform.visible = false;
            this.transform.enabled = false;
        }
        
        // Enable IK controller
        this.ikController.setEnabled(true);
        this.ikController.setChainDepth(this.ikChainDepth);
        
        // Show target helper at bone position
        if (this.ikController.targetHelper) {
            this.ikController.targetHelper.position.copy(boneWorldPos);
            if (!this.ikController.targetHelper.parent) {
                this.scene.add(this.ikController.targetHelper);
            }
            this.ikController.targetHelper.visible = true;
        }
        
    }

    /**
     * Handle IK drag mouse move
     */
    handleIKDragMove(event) {
        if (!this.ikDragging || !this.selectedBone || !this.ikController) return;

        const THREE = this.THREE;
        const rect = this.canvas.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);

        // Find intersection with drag plane
        const targetPos = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(this.ikDragPlane, targetPos)) {
            // Solve IK for the selected bone
            this.ikController.solveForBone(this.selectedBone, targetPos);
        }
    }

    /**
     * End IK dragging
     */
    endIKDrag() {
        if (!this.ikDragging) return;

        this.ikDragging = false;
        this.ikDragPlane = null;
        this.ikLastMousePos = null;
        
        // Re-enable orbit controls
        this.orbit.enabled = true;

        if (this.transform) {
            const showGizmo = this.showGizmoInIK && !!this.selectedBone;
            this.transform.visible = showGizmo;
            this.transform.enabled = showGizmo;
            if (showGizmo) this.transform.attach(this.selectedBone);
            else this.transform.detach();
        }
        
        // Sync to node
        if (this.syncCallback) {
            this.syncCallback();
        }
    }

    /**
     * Keep IK smart dragging enabled.
     */
    setIKMode(enabled = true) {
        this.ikMode = true;
        this.showGizmoInIK = false;
        
        if (this.ikController) {
            this.ikController.setEnabled(true);
        }

        if (this.transform) {
            this.transform.detach();
            this.transform.visible = false;
            this.transform.enabled = false;
        }
        
        this.requestRender();
    }

    /**
     * Set IK chain depth (how many bones affected)
     */
    setIKChainDepth(depth) {
        this.ikChainDepth = Math.max(2, Math.min(5, depth));
        if (this.ikController) {
            this.ikController.setChainDepth(this.ikChainDepth);
        }
    }

    selectBone(bone, showGizmo = false) {
        bone.updateMatrixWorld(true);
        this.selectedBone = bone;
        this.ikMode = true;

        if (this.transform) {
            if (showGizmo) {
                this.transform.enabled = true;
                this.transform.attach(bone);
                this.transform.visible = true;
                this.transform.updateMatrixWorld(true);
            } else {
                this.transform.enabled = false;
                this.transform.detach();
                this.transform.visible = false;
            }
        }
        
        this.updateMarkers();
    }

    deselectBone() {
        this.selectedBone = null;
        this.showGizmoInIK = false;

        if (this.transform) {
            this.transform.detach();
            this.transform.visible = false;
            this.transform.enabled = false;
        }
        
        this.updateMarkers();

        // End any active IK drag
        if (this.ikDragging) {
            this.endIKDrag();
        }
    }

    updateMarkers() {
        if (!this.markerMatNormal || !this.markerMatSelected) return;

        const boneIdx = this.selectedBone ? this.boneList.indexOf(this.selectedBone) : -1;

        for (let i = 0; i < this.jointMarkers.length; i++) {
            const marker = this.jointMarkers[i];
            const isSelected = (this.markerBoneIndex(marker) === boneIdx);

            // Swap shared materials instead of creating new ones or changing color props
            marker.material = isSelected ? this.markerMatSelected : this.markerMatNormal;

            if (isSelected) {
                marker.scale.setScalar(1.5);
                marker.renderOrder = 999;
            } else {
                marker.scale.setScalar(1.0);
                marker.renderOrder = 1;
            }
        }
    }

    /**
     * 显示临时状态消息
     */
    showStatusMessage(message, duration = 3000) {
        // 创建或获取状态消息元素
        let statusEl = document.getElementById('vnccs-ps-status-message');
        if (!statusEl) {
            statusEl = document.createElement('div');
            statusEl.id = 'vnccs-ps-status-message';
            statusEl.style.cssText = `
                position: absolute;
                bottom: 100px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0, 0, 0, 0.85);
                color: #4CAF50;
                padding: 10px 20px;
                border-radius: 6px;
                font-size: 13px;
                z-index: 1000;
                pointer-events: none;
                white-space: nowrap;
                transition: opacity 0.3s;
                border: 1px solid #4CAF50;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            `;
            if (this.canvasContainer) {
                this.canvasContainer.appendChild(statusEl);
            }
        }

        // 显示消息
        statusEl.textContent = message;
        statusEl.style.opacity = '1';

        // 清除之前的定时器
        if (this._statusMessageTimer) {
            clearTimeout(this._statusMessageTimer);
        }

        // 设置自动隐藏
        this._statusMessageTimer = setTimeout(() => {
            statusEl.style.opacity = '0';
        }, duration);
    }

    resize(w, h) {
        this.width = w;
        this.height = h;
        // Pass false to NOT update canvas CSS style (CSS 100% rule handles that).
        // This prevents layout thrashing in ComfyUI node2.0 mode.
        if (this.renderer) this.renderer.setSize(w, h, false);
        if (this.camera) {
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
        }
        this.requestRender();
    }

    loadData(data, keepCamera = false) {
        if (!this.initialized || !this.THREE || !this.scene) {
            this.pendingData = { data, keepCamera };
            return;
        }
        if (!data || !data.vertices || !data.bones) return;
        const THREE = this.THREE;

        // Clean previous
        if (this.skinnedMesh) {
            this.scene.remove(this.skinnedMesh);
            this.skinnedMesh.geometry.dispose();
            this.skinnedMesh.material.dispose();
            if (this.skeletonHelper) this.scene.remove(this.skeletonHelper);
        }
        if (this.jointMarkers) {
            this.jointMarkers.forEach(m => {
                if (m.parent) m.parent.remove(m);
                // Geometries are shared, but material might need disposal if unique
                if (m.material && m.material.dispose && !m.userData.sharedMaterial) m.material.dispose();
            });
        }
        this.jointMarkers = [];

        // Geometry
        const vertices = new Float32Array(data.vertices);
        const indices = new Uint32Array(data.indices);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.computeVertexNormals();

        // Center camera
        geometry.computeBoundingBox();
        const center = geometry.boundingBox.getCenter(new THREE.Vector3());
        this.meshCenter = center.clone();
        const size = geometry.boundingBox.getSize(new THREE.Vector3());
        if (!keepCamera && size.length() > 0.1 && this.orbit) {
            this.orbit.target.copy(center);
            const dist = size.length() * 1.5;
            const dir = this.camera.position.clone().sub(this.orbit.target).normalize();
            if (dir.lengthSq() < 0.001) dir.set(0, 0, 1);
            this.camera.position.copy(this.orbit.target).add(dir.multiplyScalar(dist));
            this.orbit.update();
        }

        // Bones
        this.bones = {};
        this.boneList = [];
        const rootBones = [];

        for (const bData of data.bones) {
            const bone = new THREE.Bone();
            bone.name = bData.name;
            bone.userData = {
                headPos: bData.headPos,
                parentName: bData.parent,
                semanticName: bData.semanticName || null,
                showMarker: bData.showMarker === true
            };
            bone.position.set(bData.headPos[0], bData.headPos[1], bData.headPos[2]);
            this.bones[bone.name] = bone;
            this.boneList.push(bone);
        }

        for (const bone of this.boneList) {
            const pName = bone.userData.parentName;
            if (pName && this.bones[pName]) {
                const parent = this.bones[pName];
                parent.add(bone);
                const pHead = parent.userData.headPos;
                const cHead = bone.userData.headPos;
                bone.position.set(cHead[0] - pHead[0], cHead[1] - pHead[1], cHead[2] - pHead[2]);
            } else {
                rootBones.push(bone);
            }
        }

        this.skeleton = new THREE.Skeleton(this.boneList);

        // Weights
        const vCount = vertices.length / 3;
        const skinInds = new Float32Array(vCount * 4);
        const skinWgts = new Float32Array(vCount * 4);
        const boneHeads = this.boneList.map(b => b.userData.headPos);

        if (data.weights) {
            const vWeights = new Array(vCount).fill(null).map(() => []);
            const boneMap = {};
            this.boneList.forEach((b, i) => boneMap[b.name] = i);

            for (const [bName, wData] of Object.entries(data.weights)) {
                if (boneMap[bName] === undefined) continue;
                const bIdx = boneMap[bName];
                const wInds = wData.indices;
                const wVals = wData.weights;
                for (let i = 0; i < wInds.length; i++) {
                    const vi = wInds[i];
                    if (vi < vCount) vWeights[vi].push({ b: bIdx, w: wVals[i] });
                }
            }

            for (let v = 0; v < vCount; v++) {
                const vw = vWeights[v];
                vw.sort((a, b) => b.w - a.w);
                let tot = 0;
                for (let i = 0; i < 4 && i < vw.length; i++) {
                    skinInds[v * 4 + i] = vw[i].b;
                    skinWgts[v * 4 + i] = vw[i].w;
                    tot += vw[i].w;
                }
                if (tot > 0) {
                    for (let i = 0; i < 4; i++) skinWgts[v * 4 + i] /= tot;
                } else {
                    // Orphan vertex: find nearest bone
                    const vx = vertices[v * 3];
                    const vy = vertices[v * 3 + 1];
                    const vz = vertices[v * 3 + 2];
                    let nearestIdx = 0;
                    let minDistSq = Infinity;
                    for (let bi = 0; bi < boneHeads.length; bi++) {
                        const h = boneHeads[bi];
                        const dx = vx - h[0], dy = vy - h[1], dz = vz - h[2];
                        const dSq = dx * dx + dy * dy + dz * dz;
                        if (dSq < minDistSq) { minDistSq = dSq; nearestIdx = bi; }
                    }
                    skinInds[v * 4] = nearestIdx;
                    skinWgts[v * 4] = 1;
                }
            }
        }

        geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinInds, 4));
        geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWgts, 4));

        if (data.uvs && data.uvs.length > 0) {
            geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(data.uvs), 2));
        }

        const material = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            specular: 0x111111,
            shininess: 5,
            side: THREE.DoubleSide
        });

        // Add Rim Darkening (Fresnel) effect to provide depth and contours in flat lighting
        material.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <dithering_fragment>',
                `
                #include <dithering_fragment>
                // Rim darkening using the view-space normal's Z component
                // vNormal.z is ~1.0 when facing the camera, ~0.0 at the grazing edges
                float rim = 1.0 - abs(vNormal.z);
                gl_FragColor.rgb *= (1.0 - pow(rim, 3.0) * 0.4);
                `
            );
        };

        this.skinnedMesh = new THREE.SkinnedMesh(geometry, material);
        rootBones.forEach(b => this.skinnedMesh.add(b));
        this.skinnedMesh.bind(this.skeleton);
        this.scene.add(this.skinnedMesh);

        this.skeletonHelper = new THREE.SkeletonHelper(this.skinnedMesh);
        this.scene.add(this.skeletonHelper);

        // Joint Markers
        // Create shared resources to prevent leaks
        if (!this.markerGeoNormal) this.markerGeoNormal = new THREE.SphereGeometry(0.12, 8, 8);
        if (!this.markerGeoFinger) this.markerGeoFinger = new THREE.SphereGeometry(0.06, 6, 6);

        if (!this.markerMatNormal) {
            this.markerMatNormal = new THREE.MeshBasicMaterial({
                color: 0xffaa00,
                transparent: true,
                opacity: 0.8,
                depthTest: false,
                depthWrite: false
            });
        }
        if (!this.markerMatSelected) {
            this.markerMatSelected = new THREE.MeshBasicMaterial({
                color: 0x00ffff,
                transparent: true,
                opacity: 0.9,
                depthTest: false,
                depthWrite: false
            });
        }

        const fingerPatterns = ['finger', 'thumb', 'index', 'middle', 'ring', 'pinky', 'f_'];
        const visibleMarkerBoneIndices = this.getVisibleMarkerBoneIndices();

        for (let i = 0; i < this.boneList.length; i++) {
            if (!visibleMarkerBoneIndices.has(i)) continue;
            const bone = this.boneList[i];
            const boneName = displayBoneName(bone).toLowerCase();
            const isFinger = fingerPatterns.some(p => boneName.includes(p));
            const geo = isFinger ? this.markerGeoFinger : this.markerGeoNormal;

            // Use the shared normal material by default
            const sphere = new THREE.Mesh(geo, this.markerMatNormal);
            sphere.userData.boneIndex = i;
            sphere.userData.sharedMaterial = true; // Flag to skip disposal
            sphere.renderOrder = 999;
            bone.add(sphere);
            sphere.position.set(0, 0, 0);
            this.jointMarkers.push(sphere);
        }

        // Apply cached head scale
        if (this.headScale !== 1.0) {
            this.updateHeadScale(this.headScale);
        }

        this.requestRender();
    }

    updateHeadScale(scale) {
        this.headScale = scale;
        // Find head bone if not cached or verify
        const headBone = this.boneList.find(b => displayBoneName(b).toLowerCase().includes('head'));
        if (headBone) {
            headBone.scale.set(scale, scale, scale);
            this.requestRender();
        }
    }

    // === Pose State Management ===

    getPose() {
        const bones = {};
        for (const b of this.boneList) {
            const rot = b.rotation;
            if (Math.abs(rot.x) > 1e-4 || Math.abs(rot.y) > 1e-4 || Math.abs(rot.z) > 1e-4) {
                bones[b.name] = [
                    rot.x * 180 / Math.PI,
                    rot.y * 180 / Math.PI,
                    rot.z * 180 / Math.PI
                ];
            }
        }
        return {
            bones,
            modelRotation: [this.modelRotation.x, this.modelRotation.y, this.modelRotation.z],
            camera: {
                posX: this.camera.position.x,
                posY: this.camera.position.y,
                posZ: this.camera.position.z,
                targetX: this.orbit.target.x,
                targetY: this.orbit.target.y,
                targetZ: this.orbit.target.z
            },
            // Store widget-side camera params too!
            cameraParams: this.syncCallback ? this.syncCallback(true) : null // Request params return
        };
    }

    recordState() {
        const state = this.getPose();
        // Avoid duplicate states if possible, but for drag start it's fine
        this.history.push(JSON.stringify(state));
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
        this.future = []; // Clear redo stack on new action
    }

    undo() {
        if (this.history.length === 0) return;

        const current = JSON.stringify(this.getPose());
        this.future.push(current);

        const prev = JSON.parse(this.history.pop());
        this.setPose(prev);

        // Sync after undo
        if (this.syncCallback) this.syncCallback();
    }

    redo() {
        if (this.future.length === 0) return;

        const current = JSON.stringify(this.getPose());
        this.history.push(current);

        const next = JSON.parse(this.future.pop());
        this.setPose(next);

        // Sync after redo
        if (this.syncCallback) this.syncCallback();
    }

    setPose(pose, preserveCamera = false) {
        if (!pose) {
            console.warn("[VNCCS] setPose called with null/undefined pose");
            return;
        }

        const bones = pose.bones || {};
        const modelRot = pose.modelRotation || [0, 0, 0];

        // Reset all bones
        for (const b of this.boneList) {
            b.rotation.set(0, 0, 0);
        }

        // Apply bone rotations
        for (const [bName, rot] of Object.entries(bones)) {
            const bone = this.bones[bName];
            if (bone && Array.isArray(rot) && rot.length >= 3) {
                bone.rotation.set(
                    rot[0] * Math.PI / 180,
                    rot[1] * Math.PI / 180,
                    rot[2] * Math.PI / 180
                );
            } else if (!bone) {
                console.warn(`[VNCCS] Bone not found: ${bName}`);
            }
        }

        // Apply model rotation
        this.modelRotation.x = modelRot[0] || 0;
        this.modelRotation.y = modelRot[1] || 0;
        this.modelRotation.z = modelRot[2] || 0;

        if (this.skinnedMesh) {
            this.skinnedMesh.rotation.set(
                this.modelRotation.x * Math.PI / 180,
                this.modelRotation.y * Math.PI / 180,
                this.modelRotation.z * Math.PI / 180
            );
        }

        // Camera handling - skip if preserveCamera is true.
        if (!preserveCamera) {
            if (pose.camera) {
                this.camera.position.set(
                    pose.camera.posX,
                    pose.camera.posY,
                    pose.camera.posZ
                );
                this.orbit.target.set(
                    pose.camera.targetX,
                    pose.camera.targetY,
                    pose.camera.targetZ
                );
            } else {
                const params = pose.cameraParams || (this.syncCallback ? this.syncCallback(true) : null);
                this.snapToCaptureCamera(
                    params?.width || this.width,
                    params?.height || this.height,
                    params?.zoom || DEFAULT_CAMERA_ZOOM,
                    params?.offset_x || 0,
                    params?.offset_y || 0
                );
            }
            this.orbit.update();
        }

        this.requestRender();
    }

    resetPose() {
        for (const b of this.boneList) {
            b.rotation.set(0, 0, 0);
        }
        this.modelRotation = { x: 0, y: 0, z: 0 };
        if (this.skinnedMesh) {
            this.skinnedMesh.rotation.set(0, 0, 0);
        }
        this.requestRender();
    }

    setModelRotation(x, y, z) {
        this.modelRotation.x = x;
        this.modelRotation.y = y;
        this.modelRotation.z = z;
        if (this.skinnedMesh) {
            this.skinnedMesh.rotation.set(
                x * Math.PI / 180,
                y * Math.PI / 180,
                z * Math.PI / 180
            );
        }
        this.requestRender();
    }

    loadReferenceImage(url) {
        if (!this.initialized || !this.captureCamera) {
            this.pendingBackgroundUrl = url;
            return;
        }
        const THREE = this.THREE;

        // Create plane if needed
        if (!this.refPlane) {
            const geo = new THREE.PlaneGeometry(1, 1);
            const mat = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 1.0,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            this.refPlane = new THREE.Mesh(geo, mat);
            // Render first (background)
            this.refPlane.renderOrder = -1;
            // Attach to camera so it moves with it
            this.captureCamera.add(this.refPlane);

            // Initial positioning (will be fixed in updateCaptureCamera)
            this.refPlane.position.set(0, 0, -50);
            this.refPlane.rotation.set(0, 0, 0);
        }

        // Load texture
        new THREE.TextureLoader().load(url, (tex) => {
            // Ensure sRGB for real colors
            if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
            else if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;

            if (this.refPlane) {
                this.refPlane.material.map = tex;
                this.refPlane.material.needsUpdate = true;
                this.refPlane.visible = true;
                this.requestRender();
            }
        });
    }

    removeReferenceImage() {
        if (!this.refPlane) return;
        this.captureCamera.remove(this.refPlane);
        if (this.refPlane.geometry) this.refPlane.geometry.dispose();
        if (this.refPlane.material) {
            if (this.refPlane.material.map) this.refPlane.material.map.dispose();
            this.refPlane.material.dispose();
        }
        this.refPlane = null;
        this.requestRender();
    }

    updateCaptureCamera(width, height, zoom = DEFAULT_CAMERA_ZOOM, offsetX = 0, offsetY = 0) {
        if (!this.THREE || !this.captureCamera) return; // Not initialized yet
        const baseTarget = this.meshCenter || new this.THREE.Vector3(0, 10, 0);
        // Apply offset (in world units, scaled by zoom for intuitive control)
        const target = new this.THREE.Vector3(
            baseTarget.x - offsetX,
            baseTarget.y - offsetY,
            baseTarget.z
        );
        const dist = 45;

        const effectiveZoom = Math.max(0.1, zoom * CAMERA_VIEW_SCALE);

        // Positioning relative to offset target
        this.captureCamera.aspect = width / height;
        this.captureCamera.zoom = effectiveZoom;
        this.captureCamera.updateProjectionMatrix();
        this.captureCamera.position.set(target.x, target.y, target.z + dist);
        this.captureCamera.lookAt(target);

        // Update Reference Plane
        if (this.refPlane) {
            // Distance from camera to plane (near far clip)
            const planeDist = 95;

            // Calculate height at that distance
            // h = 2 * dist * tan(fov/2). 
            // Effective FOV is scaled by zoom? 
            // THREE.js zoom divides the frustum size. 
            // So visible height = height / zoom.

            const vFOV = (this.captureCamera.fov * Math.PI) / 180;
            const h = 2 * planeDist * Math.tan(vFOV / 2) / effectiveZoom;
            const w = h * this.captureCamera.aspect;

            this.refPlane.position.set(0, 0, -planeDist);
            this.refPlane.scale.set(w, h, 1);
            this.refPlane.rotation.set(0, 0, 0); // Ensure it faces camera (camera looks down -Z, plane is XY)
        }

        if (this.captureFrame) {
            const vFOV = (this.captureCamera.fov * Math.PI) / 180;
            // Frame at target distance (dist = 45)
            const h = 2 * dist * Math.tan(vFOV / 2) / effectiveZoom;
            const w = h * this.captureCamera.aspect;

            this.captureFrame.position.copy(target);
            this.captureFrame.scale.set(w / 2, h / 2, 1);
            this.captureFrame.lookAt(this.captureCamera.position);
            this.captureFrame.visible = true;
        }

        if (this.captureHelper) {
            this.captureHelper.update();
            this.captureHelper.visible = false;
        }
        this.requestRender();
    }

    snapToCaptureCamera(width, height, zoom = DEFAULT_CAMERA_ZOOM, offsetX = 0, offsetY = 0) {
        this.updateCaptureCamera(width, height, zoom, offsetX, offsetY);

        // Disable damping for hard reset
        const prevDamping = this.orbit.enableDamping;
        this.orbit.enableDamping = false;

        // Copy capture camera to viewport camera
        this.camera.position.copy(this.captureCamera.position);
        this.camera.zoom = Math.max(0.1, zoom * CAMERA_VIEW_SCALE);
        this.camera.updateProjectionMatrix();

        const baseTarget = this.meshCenter || new this.THREE.Vector3(0, 10, 0);
        const target = new this.THREE.Vector3(
            baseTarget.x - offsetX,
            baseTarget.y - offsetY,
            baseTarget.z
        );
        const viewDir = this.camera.position.clone().sub(target);
        if (viewDir.lengthSq() > 0.0001) {
            this.camera.position.copy(target).add(viewDir.multiplyScalar(1 / EDITOR_VIEW_DOLLY_SCALE));
        }
        this.orbit.target.copy(target);
        this.orbit.update();

        this.orbit.enableDamping = prevDamping;
    }

    capture(width, height, zoom, bgColor, offsetX = 0, offsetY = 0) {
        if (!this.initialized) return null;

        // Ensure camera is setup
        this.updateCaptureCamera(width, height, zoom, offsetX, offsetY);

        // Hide editor-only helpers from exported pose images.
        const helperVisibility = {
            skeleton: this.skeletonHelper?.visible ?? null,
            grid: this.gridHelper?.visible ?? null,
            captureFrame: this.captureFrame?.visible ?? null,
            transform: this.transform?.visible ?? null,
            transformEnabled: this.transform?.enabled ?? null,
            ikTarget: this.ikController?.targetHelper?.visible ?? null,
            markers: this.jointMarkers.map(m => m.visible)
        };
        if (this.skeletonHelper) this.skeletonHelper.visible = false;
        if (this.gridHelper) this.gridHelper.visible = false;
        if (this.captureFrame) this.captureFrame.visible = false;
        if (this.transform) {
            this.transform.visible = false;
            this.transform.enabled = false;
        }
        if (this.ikController?.targetHelper) this.ikController.targetHelper.visible = false;
        this.jointMarkers.forEach(m => m.visible = false);

        // Background Override
        const oldBg = this.scene.background;
        if (bgColor && Array.isArray(bgColor) && bgColor.length === 3) {
            this.scene.background = new this.THREE.Color(
                bgColor[0] / 255, bgColor[1] / 255, bgColor[2] / 255
            );
        }

        let dataURL = null;
        const oldPixelRatio = this.renderer.getPixelRatio();

        try {
            // Resize renderer to output size
            const originalSize = new this.THREE.Vector2();
            this.renderer.getSize(originalSize);

            this.renderer.setPixelRatio(1); // Force 1:1 pixel ratio for capture
            this.renderer.setSize(width, height, false); // false = don't update style to avoid layout thrashing

            // Render with Fixed Camera
            this.renderer.render(this.scene, this.captureCamera);
            dataURL = this.canvas.toDataURL("image/png");

            // Restore renderer
            this.renderer.setPixelRatio(oldPixelRatio);
            this.renderer.setSize(originalSize.x, originalSize.y, true); // Update style back

        } catch (e) {
            console.error("Capture failed:", e);
        } finally {
            // Restore state
            if (this.renderer.getPixelRatio() !== oldPixelRatio) this.renderer.setPixelRatio(oldPixelRatio);
            this.scene.background = oldBg;

            this.jointMarkers.forEach((m, index) => {
                m.visible = helperVisibility.markers[index] ?? true;
            });
            if (this.skeletonHelper && helperVisibility.skeleton !== null) this.skeletonHelper.visible = helperVisibility.skeleton;
            if (this.gridHelper && helperVisibility.grid !== null) this.gridHelper.visible = helperVisibility.grid;
            if (this.captureFrame && helperVisibility.captureFrame !== null) this.captureFrame.visible = helperVisibility.captureFrame;
            if (this.transform) {
                if (helperVisibility.transform !== null) this.transform.visible = helperVisibility.transform;
                if (helperVisibility.transformEnabled !== null) this.transform.enabled = helperVisibility.transformEnabled;
            }
            if (this.ikController?.targetHelper && helperVisibility.ikTarget !== null) {
                this.ikController.targetHelper.visible = helperVisibility.ikTarget;
            }

            // Re-render viewport
            this.renderer.render(this.scene, this.camera);
        }
        return dataURL;
    }
}


// === Pose Studio Widget ===
class PoseStudioWidget {
    constructor(node) {
        this.node = node;
        this.container = null;
        this.viewer = null;

        this.poses = [{}];  // Array of pose data
        this.activeTab = 0;
        this.poseCaptures = []; // Cache for captured images

        // Export settings
        this.exportParams = {
            view_width: 1024,
            view_height: 1024,
            cam_zoom: DEFAULT_CAMERA_ZOOM,
            cam_offset_x: 0,
            cam_offset_y: 0,
            output_mode: "LIST",
            grid_columns: 2,
            bg_color: [255, 255, 255],
            keepOriginalLighting: false,
            model_id: null,
            background_url: null
        };

        // Lighting settings (array of light configs)
        this.lightParams = [
            { type: 'directional', color: '#ffffff', intensity: 2.0, x: 10, y: 20, z: 30 },
            { type: 'ambient', color: '#505050', intensity: 1.0, x: 0, y: 0, z: 0 }
        ];

        this.sliders = {};
        this.exportWidgets = {};
        this.canvasContainer = null;

        this.createUI();
    }

    createUI() {
        // Main container
        this.container = document.createElement("div");
        this.container.className = "vnccs-pose-studio";

        // === LEFT PANEL ===
        const leftPanel = document.createElement("div");
        leftPanel.className = "vnccs-ps-left";

        // --- MODEL ROTATION SECTION ---
        const rotSection = this.createSection("模型旋转", false);

        ['x', 'y', 'z'].forEach(axis => {
            const field = document.createElement("div");
            field.className = "vnccs-ps-field";

            const labelRow = document.createElement("div");
            labelRow.className = "vnccs-ps-label-row";

            const labelSpan = document.createElement("span");
            labelSpan.className = "vnccs-ps-label";
            labelSpan.textContent = axis.toUpperCase();

            const valueSpan = document.createElement("span");
            valueSpan.className = "vnccs-ps-value";
            valueSpan.textContent = "0°";

            // Reset button
            const resetBtn = document.createElement("button");
            resetBtn.className = "vnccs-ps-reset-btn";
            resetBtn.innerHTML = "↺";
            resetBtn.title = "重置为 0°";
            resetBtn.onclick = (e) => {
                e.stopPropagation();
                slider.value = 0;
                valueSpan.innerText = "0°";
                if (this.viewer) {
                    this.viewer.modelRotation[axis] = 0;
                    if (this.viewer.skinnedMesh) {
                        const r = this.viewer.modelRotation;
                        this.viewer.skinnedMesh.rotation.set(
                            r.x * Math.PI / 180,
                            r.y * Math.PI / 180,
                            r.z * Math.PI / 180
                        );
                    }
                    this.syncToNode();
                }
            };

            // Group value and reset button together on the right
            const valueRow = document.createElement("div");
            valueRow.style.display = "flex";
            valueRow.style.alignItems = "center";
            valueRow.style.gap = "6px";
            valueRow.appendChild(valueSpan);
            valueRow.appendChild(resetBtn);

            labelRow.appendChild(labelSpan);
            labelRow.appendChild(valueRow);

            const wrap = document.createElement("div");
            wrap.className = "vnccs-ps-slider-wrap";

            const slider = document.createElement("input");
            slider.type = "range";
            slider.className = "vnccs-ps-slider";
            slider.min = -180;
            slider.max = 180;
            slider.step = 1;
            slider.value = 0;

            slider.addEventListener("input", () => {
                const val = parseFloat(slider.value);
                valueSpan.innerText = `${val}°`;
                if (this.viewer) {
                    this.viewer.modelRotation[axis] = val;
                    if (this.viewer.skinnedMesh) {
                        const r = this.viewer.modelRotation;
                        this.viewer.skinnedMesh.rotation.set(
                            r.x * Math.PI / 180,
                            r.y * Math.PI / 180,
                            r.z * Math.PI / 180
                        );
                    }
                    this.syncToNode();
                }
            });

            this.sliders[`rot_${axis}`] = { slider, label: valueSpan };

            wrap.appendChild(slider);
            field.appendChild(labelRow);
            field.appendChild(wrap);
            rotSection.content.appendChild(field);
        });

        leftPanel.appendChild(rotSection.el);

        // --- CAMERA SETTINGS SECTION ---
        const camSection = this.createSection("相机", true);

        const resolutionField = this.createCameraResolutionField();
        camSection.content.appendChild(resolutionField);

        // Zoom (with live preview)
        // Zoom (with live preview)
        const zoomField = this.createSliderField("缩放", "cam_zoom", 0.1, 7.0, 0.01, DEFAULT_CAMERA_ZOOM, this.exportParams, true);
        camSection.content.appendChild(zoomField);

        // Position X
        // Position X
        // Camera Radar Control
        this.createCameraRadar(camSection);



        leftPanel.appendChild(camSection.el);

        // Initialize default lights if empty (Lighting logic remains same, just container changes)
        if (this.lightParams.length === 0) {
            this.lightParams.push(
                { type: 'ambient', color: '#404040', intensity: 0.5 },
                { type: 'directional', color: '#ffffff', intensity: 1.0, x: 1, y: 2, z: 3 }
            );
        }


        // --- EXPORT SETTINGS SECTION ---
        const exportSection = this.createSection("导出设置", true);

        // Output Mode
        // Output Mode (Toggle)
        const modeField = document.createElement("div");
        modeField.className = "vnccs-ps-field";
        const modeLabel = document.createElement("div");
        modeLabel.className = "vnccs-ps-label";
        modeLabel.innerText = "输出模式";

        const modeToggle = document.createElement("div");
        modeToggle.className = "vnccs-ps-toggle";

        const btnList = document.createElement("button");
        btnList.className = "vnccs-ps-toggle-btn list";
        btnList.innerText = "列表";
        const btnGrid = document.createElement("button");
        btnGrid.className = "vnccs-ps-toggle-btn grid";
        btnGrid.innerText = "网格";

        const updateModeUI = () => {
            const isGrid = this.exportParams.output_mode === 'GRID';
            btnList.classList.toggle("active", !isGrid);
            btnGrid.classList.toggle("active", isGrid);
        };

        btnList.onclick = () => {
            this.exportParams.output_mode = 'LIST';
            updateModeUI();
            this.syncToNode(true);
        }
        btnGrid.onclick = () => {
            this.exportParams.output_mode = 'GRID';
            updateModeUI();
            this.syncToNode(true);
        }

        updateModeUI();
        modeToggle.appendChild(btnList);
        modeToggle.appendChild(btnGrid);
        modeField.appendChild(modeLabel);
        modeField.appendChild(modeToggle);

        // Cache for programmatic updates
        this.exportWidgets['output_mode'] = {
            value: this.exportParams.output_mode, // dummy
            update: (val) => {
                this.exportParams.output_mode = val;
                updateModeUI();
            }
        };

        exportSection.content.appendChild(modeField);

        // Grid Columns
        const colsField = this.createInputField("网格列数", "grid_columns", "number", 1, 6, 1);
        exportSection.content.appendChild(colsField);

        // BG Color
        const colorField = this.createColorField("背景", "bg_color");
        exportSection.content.appendChild(colorField);

        leftPanel.appendChild(exportSection.el);

        this.container.appendChild(leftPanel);

        // === CENTER PANEL ===
        const centerPanel = document.createElement("div");
        centerPanel.className = "vnccs-ps-center";

        // Canvas Container
        this.canvasContainer = document.createElement("div");
        this.canvasContainer.className = "vnccs-ps-canvas-wrap";

        const canvas = document.createElement("canvas");
        this.canvasContainer.appendChild(canvas);
        
        centerPanel.appendChild(this.canvasContainer);

        // Action Bar
        const actions = document.createElement("div");
        actions.className = "vnccs-ps-actions";

        const undoBtn = document.createElement("button");
        undoBtn.className = "vnccs-ps-btn";
        undoBtn.innerHTML = '<span class="vnccs-ps-btn-icon">↩</span> 撤销';
        undoBtn.onclick = () => this.viewer && this.viewer.undo();

        const redoBtn = document.createElement("button");
        redoBtn.className = "vnccs-ps-btn";
        redoBtn.innerHTML = '<span class="vnccs-ps-btn-icon">↪</span> 重做';
        redoBtn.onclick = () => this.viewer && this.viewer.redo();

        actions.appendChild(undoBtn);
        actions.appendChild(redoBtn);

        this.updateIKModeUI = () => {
            if (this.viewer) {
                this.viewer.setIKMode(true);
            }
        };

        // === IK Chain Depth Selector ===
        const ikDepthWrap = document.createElement("div");
        ikDepthWrap.className = "vnccs-ps-field";
        ikDepthWrap.style.display = "flex";
        ikDepthWrap.style.alignItems = "center";
        ikDepthWrap.style.gap = "4px";
        ikDepthWrap.style.marginLeft = "4px";

        const ikDepthLabel = document.createElement("span");
        ikDepthLabel.className = "vnccs-ps-label";
        ikDepthLabel.style.fontSize = "10px";
        ikDepthLabel.style.whiteSpace = "nowrap";
        ikDepthLabel.innerText = "链长:";
        ikDepthLabel.title = "IK影响的骨骼数量";

        const ikDepthSelect = document.createElement("select");
        ikDepthSelect.className = "vnccs-ps-select";
        ikDepthSelect.style.width = "50px";
        ikDepthSelect.style.padding = "4px";

        [2, 3, 4, 5].forEach(depth => {
            const opt = document.createElement("option");
            opt.value = depth;
            opt.innerText = depth;
            opt.selected = depth === 2;
            ikDepthSelect.appendChild(opt);
        });

        ikDepthSelect.onchange = () => {
            const depth = parseInt(ikDepthSelect.value);
            if (this.viewer) {
                this.viewer.setIKChainDepth(depth);
            }
        };

        ikDepthWrap.appendChild(ikDepthLabel);
        ikDepthWrap.appendChild(ikDepthSelect);
        actions.appendChild(ikDepthWrap);

        const resetBtn = document.createElement("button");
        resetBtn.className = "vnccs-ps-btn";
        resetBtn.innerHTML = '<span class="vnccs-ps-btn-icon">↺</span> 重置';
        resetBtn.addEventListener("click", () => this.resetCurrentPose());

        const refBtn = document.createElement("button");
        refBtn.className = "vnccs-ps-btn";
        refBtn.innerHTML = '<span class="vnccs-ps-btn-icon">🖼️</span> 背景';
        refBtn.title = "加载或移除背景图片";
        refBtn.onclick = () => {
            if (this.viewer && this.viewer.refPlane) {
                this.viewer.removeReferenceImage();
                this.exportParams.background_url = null;
                this.syncToNode(false);
                refBtn.innerHTML = '<span class="vnccs-ps-btn-icon">🖼️</span> 背景';
                refBtn.classList.remove('danger');
            } else {
                this.loadReference();
            }
        };
        this.refBtn = refBtn;

        // Hidden file input for reference image
        const refInput = document.createElement("input");
        refInput.type = "file";
        refInput.accept = "image/*";
        refInput.style.display = "none";
        refInput.addEventListener("change", (e) => this.handleRefImport(e));
        this.fileRefInput = refInput;
        this.container.appendChild(refInput);

        actions.appendChild(resetBtn);
        actions.appendChild(refBtn);

        centerPanel.appendChild(actions);

        this.container.appendChild(centerPanel);

        // === RIGHT SIDEBAR (LIGHTING) ===
        const rightSidebar = document.createElement("div");
        rightSidebar.className = "vnccs-ps-right-sidebar";

        const lightSection = this.createSection("灯光", true);
        this.lightListContainer = document.createElement("div");
        this.lightListContainer.className = "vnccs-ps-light-list";

        const lightToolbar = document.createElement("div");
        lightToolbar.className = "vnccs-ps-light-header";
        lightToolbar.style.padding = "0 0 8px 0";
        lightToolbar.style.background = "transparent";
        lightToolbar.style.border = "none";

        // Keep Original Lighting Toggle Button
        const overrideBtn = document.createElement("button");
        overrideBtn.className = "vnccs-ps-btn full";
        overrideBtn.style.marginBottom = "12px";
        overrideBtn.style.height = "36px";
        overrideBtn.style.fontSize = "11px";
        overrideBtn.style.textTransform = "uppercase";
        overrideBtn.style.letterSpacing = "0.5px";
        overrideBtn.style.fontWeight = "bold";
        overrideBtn.style.transition = "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)";

        this.updateOverrideBtn = () => {
            const active = this.exportParams.keepOriginalLighting;
            overrideBtn.innerHTML = active ?
                '<span style="margin-right:8px;">🧼</span> 保持原始灯光' :
                '<span style="margin-right:8px;">💡</span> 保持原始灯光';

            if (active) {
                overrideBtn.style.background = "#2ea043"; // Success green
                overrideBtn.style.borderColor = "#3fb950";
                overrideBtn.style.color = "#fff";
                overrideBtn.style.boxShadow = "0 0 15px rgba(46, 160, 67, 0.4)";
            } else {
                overrideBtn.style.background = "var(--ps-panel)";
                overrideBtn.style.borderColor = "var(--ps-border)";
                overrideBtn.style.color = "var(--ps-text-muted)";
                overrideBtn.style.boxShadow = "none";
            }
        };

        overrideBtn.onclick = () => {
            this.exportParams.keepOriginalLighting = !this.exportParams.keepOriginalLighting;
            this.updateOverrideBtn();
            this.applyLighting();
            this.refreshLightUI(); // To dim/disable UI if needed
            this.syncToNode(false);
        };
        this.updateOverrideBtn();
        lightSection.content.appendChild(overrideBtn);

        const lightLabel = document.createElement("span");
        lightLabel.className = "vnccs-ps-label";
        lightLabel.innerText = "场景灯光";

        const resetLightBtn = document.createElement("button");
        resetLightBtn.className = "vnccs-ps-reset-btn";
        resetLightBtn.innerHTML = "↺";
        resetLightBtn.title = "重置灯光";
        resetLightBtn.onclick = () => {
            this.lightParams = [
                { type: 'ambient', color: '#404040', intensity: 0.5 },
                { type: 'directional', color: '#ffffff', intensity: 1.0, x: 1, y: 2, z: 3 }
            ];
            this.refreshLightUI();
            this.applyLighting();
        };

        lightToolbar.appendChild(lightLabel);
        lightToolbar.appendChild(resetLightBtn);
        lightSection.content.appendChild(lightToolbar);
        lightSection.content.appendChild(this.lightListContainer);
        rightSidebar.appendChild(lightSection.el);

        this.container.appendChild(rightSidebar);

        // Loading Overlay
        this.loadingOverlay = document.createElement("div");
        this.loadingOverlay.className = "vnccs-ps-loading-overlay";
        this.loadingOverlay.innerHTML = `
            <div class="vnccs-ps-loading-spinner"></div>
            <div class="vnccs-ps-loading-text">加载模型中...</div>
        `;
        this.container.appendChild(this.loadingOverlay);

        // Initial render of lights
        this.refreshLightUI();

        // Initialize viewer
        this.viewer = new PoseViewer(canvas);
        this.viewer.syncCallback = (returnParams = false) => {
            if (returnParams) {
                return {
                    width: this.exportParams.view_width,
                    height: this.exportParams.view_height,
                    offset_x: this.exportParams.cam_offset_x,
                    offset_y: this.exportParams.cam_offset_y,
                    zoom: this.exportParams.cam_zoom
                };
            }
            this.syncToNode();
        };
        this.viewer.init();
        this.viewer.setIKMode(true);
        this.updateIKModeUI();
        // Force initial lighting
        if (this.lightParams) {
            this.viewer.updateLights(this.lightParams);
        }
    }

    // === UI Helper Methods ===

    createSection(title, expanded = true) {
        const section = document.createElement("div");
        section.className = "vnccs-ps-section" + (expanded ? "" : " collapsed");

        const header = document.createElement("div");
        header.className = "vnccs-ps-section-header";
        header.innerHTML = `
            <span class="vnccs-ps-section-title">${title}</span>
            <span class="vnccs-ps-section-toggle">▼</span>
        `;
        header.addEventListener("click", () => {
            section.classList.toggle("collapsed");
        });

        const content = document.createElement("div");
        content.className = "vnccs-ps-section-content";

        section.appendChild(header);
        section.appendChild(content);

        return { el: section, content };
    }

    createSliderField(label, key, min, max, step, defaultValue, target, isExport = false) {
        const field = document.createElement("div");
        field.className = "vnccs-ps-field";

        const labelRow = document.createElement("div");
        labelRow.className = "vnccs-ps-label-row";
        labelRow.style.display = "flex";
        labelRow.style.justifyContent = "space-between";
        labelRow.style.alignItems = "center";

        const value = target[key];
        const displayVal = key === 'age' ? Math.round(value) : value.toFixed(2);
        const valueRow = document.createElement("div");
        valueRow.style.display = "flex";
        valueRow.style.alignItems = "center";
        valueRow.style.gap = "6px";

        const valueSpan = document.createElement("span");
        valueSpan.className = "vnccs-ps-value";
        valueSpan.innerText = displayVal;

        const resetBtn = document.createElement("button");
        resetBtn.className = "vnccs-ps-reset-btn";
        resetBtn.innerHTML = "↺";
        resetBtn.title = `重置为 ${defaultValue}`;

        valueRow.appendChild(valueSpan);
        valueRow.appendChild(resetBtn);

        // Label Side
        const labelEl = document.createElement("span");
        labelEl.className = "vnccs-ps-label";
        labelEl.innerText = label;

        labelRow.innerHTML = '';
        labelRow.appendChild(labelEl);
        labelRow.appendChild(valueRow);

        const wrap = document.createElement("div");
        wrap.className = "vnccs-ps-slider-wrap";

        const slider = document.createElement("input");
        slider.type = "range";
        slider.className = "vnccs-ps-slider";
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = value;

        // Reset logic
        resetBtn.onclick = (e) => {
            e.stopPropagation();
            slider.value = defaultValue;
            slider.dispatchEvent(new Event('input'));
            slider.dispatchEvent(new Event('change'));
        };

        slider.addEventListener("input", () => {
            const val = parseFloat(slider.value);
            valueSpan.innerText = key === 'age' ? Math.round(val) : val.toFixed(2);

            if (isExport) {
                this.exportParams[key] = val;
                // Live preview for camera params - sync viewport too
                const isCamParam = ['cam_zoom', 'cam_offset_x', 'cam_offset_y'].includes(key);
                if (isCamParam && this.viewer) {
                    this.viewer.snapToCaptureCamera(
                        this.exportParams.view_width,
                        this.exportParams.view_height,
                        this.exportParams.cam_zoom,
                        this.exportParams.cam_offset_x,
                        this.exportParams.cam_offset_y
                    );
                }
            }
        });

        slider.addEventListener("change", () => {
            if (isExport) {
                const needsFull = ['view_width', 'view_height', 'cam_zoom', 'bg_color', 'cam_offset_x', 'cam_offset_y'].includes(key);
                this.syncToNode(needsFull);
            }
        });

        if (isExport) {
            this.exportWidgets[key] = slider;
        }

        wrap.appendChild(slider);
        field.appendChild(labelRow);
        field.appendChild(wrap);
        return field;
    }

    createInputField(label, key, type, min, max, step) {
        const field = document.createElement("div");
        field.className = "vnccs-ps-field";

        const labelEl = document.createElement("div");
        labelEl.className = "vnccs-ps-label";
        labelEl.innerText = label;

        const input = document.createElement("input");
        input.type = type;
        input.className = "vnccs-ps-input";
        input.min = min;
        input.max = max;
        input.step = step;
        input.value = this.exportParams[key];

        const isDimension = (key === 'view_width' || key === 'view_height');
        const eventType = isDimension ? 'change' : 'input';

        input.addEventListener(eventType, () => {
            let val = parseFloat(input.value);
            if (isNaN(val)) val = this.exportParams[key];
            val = Math.max(min, Math.min(max, val));

            // For grid columns, integer only
            if (key === 'grid_columns') val = Math.round(val);

            input.value = val;
            this.exportParams[key] = val;
            this.syncToNode(isDimension);
        });

        this.exportWidgets[key] = input;

        field.appendChild(labelEl);
        field.appendChild(input);
        return field;
    }

    createSelectField(label, key, options) {
        const field = document.createElement("div");
        field.className = "vnccs-ps-field";

        const labelEl = document.createElement("div");
        labelEl.className = "vnccs-ps-label";
        labelEl.innerText = label;

        const select = document.createElement("select");
        select.className = "vnccs-ps-select";

        options.forEach(opt => {
            const el = document.createElement("option");
            el.value = opt;
            el.innerText = opt;
            el.selected = this.exportParams[key] === opt;
            select.appendChild(el);
        });

        select.addEventListener("change", () => {
            this.exportParams[key] = select.value;
            this.syncToNode();
        });

        this.exportWidgets[key] = select;

        field.appendChild(labelEl);
        field.appendChild(select);
        return field;
    }

    cameraResolutionValue(width = this.exportParams.view_width, height = this.exportParams.view_height) {
        const match = CAMERA_1K_RESOLUTIONS.find(opt => Number(opt.width) === Number(width) && Number(opt.height) === Number(height));
        return match ? `${match.width}x${match.height}` : `${CAMERA_1K_RESOLUTIONS[0].width}x${CAMERA_1K_RESOLUTIONS[0].height}`;
    }

    createCameraResolutionField() {
        const field = document.createElement("div");
        field.className = "vnccs-ps-field";

        const labelEl = document.createElement("div");
        labelEl.className = "vnccs-ps-label";
        labelEl.innerText = "1K比例";

        const select = document.createElement("select");
        select.className = "vnccs-ps-select";

        CAMERA_1K_RESOLUTIONS.forEach(opt => {
            const el = document.createElement("option");
            el.value = `${opt.width}x${opt.height}`;
            el.innerText = opt.label;
            el.selected = el.value === this.cameraResolutionValue();
            select.appendChild(el);
        });

        select.addEventListener("change", () => {
            const opt = CAMERA_1K_RESOLUTIONS.find(item => `${item.width}x${item.height}` === select.value) || CAMERA_1K_RESOLUTIONS[0];
            this.exportParams.view_width = opt.width;
            this.exportParams.view_height = opt.height;
            if (this.viewer) {
                this.viewer.snapToCaptureCamera(
                    this.exportParams.view_width,
                    this.exportParams.view_height,
                    this.exportParams.cam_zoom || DEFAULT_CAMERA_ZOOM,
                    this.exportParams.cam_offset_x || 0,
                    this.exportParams.cam_offset_y || 0
                );
            }
            this.syncToNode(true);
        });

        select.update = () => {
            select.value = this.cameraResolutionValue();
        };

        this.exportWidgets.camera_resolution = select;

        field.appendChild(labelEl);
        field.appendChild(select);
        return field;
    }

    createCameraRadar(section) {
        const wrap = document.createElement("div");
        wrap.className = "vnccs-ps-radar-wrap";
        wrap.style.display = "flex";
        wrap.style.flexDirection = "column";
        wrap.style.alignItems = "center";
        wrap.style.marginTop = "10px";
        wrap.style.background = "#181818";
        wrap.style.border = "1px solid #333";
        wrap.style.borderRadius = "4px";
        wrap.style.padding = "10px";

        // Canvas
        const canvas = document.createElement("canvas");
        const size = 200;
        canvas.width = size;
        canvas.height = size;
        canvas.style.width = "200px";
        canvas.style.height = "200px";
        canvas.style.cursor = "crosshair";

        const ctx = canvas.getContext("2d");

        // Interaction State
        let isDragging = false;

        const range = 20.0; // Max offset range (+/- 20)

        const updateFromMouse = (e) => {
            const rect = canvas.getBoundingClientRect();
            // Scaling support
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;

            const mouseX = (e.clientX - rect.left) * scaleX;
            const mouseY = (e.clientY - rect.top) * scaleY;

            // Aspect Ratio Logic to find active area
            const viewW = this.exportParams.view_width || 1024;
            const viewH = this.exportParams.view_height || 1024;
            const ar = viewW / viewH;

            // Dynamic Range calculation based on Zoom
            const zoom = this.exportParams.cam_zoom || DEFAULT_CAMERA_ZOOM;
            const baseRange = 12.05;
            const rangeY = baseRange / zoom;
            const rangeX = rangeY * ar;

            // Fit box in canvas (margin 10px) (Visual Scale 0.5 for 2x Range)
            const margin = 10;
            const visualScale = 0.5;
            const maxW = (size - margin * 2) * visualScale;
            const maxH = (size - margin * 2) * visualScale;
            let drawW, drawH;

            if (ar >= 1) { // Landscape
                drawW = maxW;
                drawH = maxW / ar;
            } else { // Portrait
                drawH = maxH;
                drawW = maxH * ar;
            }

            const cx = size / 2;
            const cy = size / 2;

            // Clamping to box
            const halfW = drawW / 2;
            const halfH = drawH / 2;

            let dx = (mouseX - cx);
            let dy = (mouseY - cy);

            // Clamp to Canvas size (not frame size), so we can drag outside frame
            // Frame is drawW/drawH. Canvas is size (200).
            // Let's allow dragging to the very edge of canvas minus margin
            const maxDragX = (size / 2) - 5;
            const maxDragY = (size / 2) - 5;

            dx = Math.max(-maxDragX, Math.min(maxDragX, dx));
            dy = Math.max(-maxDragY, Math.min(maxDragY, dy));

            const normX = dx / halfW;
            const normY = dy / halfH;

            // X: Dot Right -> Model Right
            this.exportParams.cam_offset_x = normX * rangeX;

            // Y: Dot Top (neg) -> Model Top
            this.exportParams.cam_offset_y = -normY * rangeY;

            draw();

            // Sync Viewport
            if (this.viewer) {
                this.viewer.snapToCaptureCamera(
                    this.exportParams.view_width,
                    this.exportParams.view_height,
                    this.exportParams.cam_zoom,
                    this.exportParams.cam_offset_x,
                    this.exportParams.cam_offset_y
                );
            }
        };

        canvas.addEventListener("mousedown", (e) => {
            isDragging = true;
            updateFromMouse(e);
        });

        document.addEventListener("mousemove", (e) => {
            if (isDragging) updateFromMouse(e);
        });

        document.addEventListener("mouseup", () => {
            if (isDragging) {
                isDragging = false;
                this.syncToNode(false);
            }
        });

        const draw = () => {
            // Clear
            ctx.fillStyle = "#111";
            ctx.fillRect(0, 0, size, size);

            const viewW = this.exportParams.view_width || 1024;
            const viewH = this.exportParams.view_height || 1024;
            const ar = viewW / viewH;

            // Recalculate ranges for drawing
            const zoom = this.exportParams.cam_zoom || DEFAULT_CAMERA_ZOOM;
            const baseRange = 12.05;
            const rangeY = baseRange / zoom;
            const rangeX = rangeY * ar;

            // Fit box (Visual Scale 0.5)
            const margin = 10;
            const visualScale = 0.5;
            const maxW = (size - margin * 2) * visualScale;
            const maxH = (size - margin * 2) * visualScale;
            let drawW, drawH;

            if (ar >= 1) { // Landscape
                drawW = maxW;
                drawH = maxW / ar;
            } else { // Portrait
                drawH = maxH;
                drawW = maxH * ar;
            }

            const cx = size / 2;
            const cy = size / 2;

            // Draw Viewer Frame
            ctx.fillStyle = "#222";
            ctx.fillRect(cx - drawW / 2, cy - drawH / 2, drawW, drawH);
            ctx.strokeStyle = "#444";
            ctx.lineWidth = 1;
            ctx.strokeRect(cx - drawW / 2, cy - drawH / 2, drawW, drawH);

            // Grid
            ctx.beginPath();
            ctx.strokeStyle = "#333";
            ctx.moveTo(cx, cy - drawH / 2);
            ctx.lineTo(cx, cy + drawH / 2);
            ctx.moveTo(cx - drawW / 2, cy);
            ctx.lineTo(cx + drawW / 2, cy);
            ctx.stroke();

            // Draw Dot (Target)
            const normX = (this.exportParams.cam_offset_x || 0) / rangeX;
            const normY = -(this.exportParams.cam_offset_y || 0) / rangeY;

            const dotX = cx + normX * (drawW / 2);
            const dotY = cy + normY * (drawH / 2);

            // Dot
            ctx.beginPath();
            ctx.fillStyle = "#3584e4";
            ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
            ctx.fill();

            // Crosshair
            ctx.beginPath();
            ctx.strokeStyle = "#3584e4";
            ctx.lineWidth = 1;
            ctx.moveTo(dotX - 6, dotY);
            ctx.lineTo(dotX + 6, dotY);
            ctx.moveTo(dotX, dotY - 6);
            ctx.lineTo(dotX, dotY + 6);
            ctx.stroke();

            // Info Text
            ctx.fillStyle = "#666";
            ctx.font = "10px monospace";
            ctx.textAlign = "right";
            // ctx.fillText(`X:${(this.exportParams.cam_offset_x||0).toFixed(1)}`, size-5, 12);
        };

        // Expose redraw
        this.radarRedraw = draw;

        // Recenter Button
        const recenterBtn = document.createElement("button");
        recenterBtn.className = "vnccs-ps-btn";
        recenterBtn.style.marginTop = "8px";
        recenterBtn.style.width = "100%";
        recenterBtn.innerHTML = '<span class="vnccs-ps-btn-icon">⌖</span> 重新居中';
        recenterBtn.onclick = () => {
            this.exportParams.cam_offset_x = 0;
            this.exportParams.cam_offset_y = 0;
            draw();
            if (this.viewer) {
                this.viewer.snapToCaptureCamera(
                    this.exportParams.view_width,
                    this.exportParams.view_height,
                    this.exportParams.cam_zoom,
                    0, 0
                );
            }
            this.syncToNode(false);
        };

        wrap.appendChild(canvas);
        wrap.appendChild(recenterBtn);
        section.content.appendChild(wrap);

        // Initial Draw
        requestAnimationFrame(() => draw());
    }

    createLightRadar(light) {
        const size = 120;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        canvas.className = "vnccs-ps-light-radar-canvas";
        const ctx = canvas.getContext("2d");

        let isDragging = false;
        const range = (light.type === 'point') ? 10.0 : 100;

        const draw = () => {
            ctx.fillStyle = "#111";
            ctx.fillRect(0, 0, size, size);

            const cx = size / 2;
            const cy = size / 2;

            // Grid
            ctx.beginPath();
            ctx.strokeStyle = "#222";
            ctx.lineWidth = 1;
            ctx.moveTo(cx, 0); ctx.lineTo(cx, size);
            ctx.moveTo(0, cy); ctx.lineTo(size, cy);
            ctx.stroke();

            // Circles
            ctx.beginPath();
            ctx.strokeStyle = "#1a1a1a";
            ctx.arc(cx, cy, size / 4, 0, Math.PI * 2);
            ctx.arc(cx, cy, size / 2 - 2, 0, Math.PI * 2);
            ctx.stroke();

            // Dot (X and Z)
            const dotX = cx + (light.x / range) * (size / 2);
            const dotY = cy + (light.z / range) * (size / 2);
            const hex = this.parseColorToHex(light.color);

            // Shadow/Glow
            const grad = ctx.createRadialGradient(dotX, dotY, 2, dotX, dotY, 12);
            grad.addColorStop(0, hex + "66");
            grad.addColorStop(1, "transparent");
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(dotX, dotY, 12, 0, Math.PI * 2);
            ctx.fill();

            // Core
            ctx.beginPath();
            ctx.fillStyle = hex;
            ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 1;
            ctx.stroke();

            // Labels
            ctx.fillStyle = "#444";
            ctx.font = "8px monospace";
            ctx.textAlign = "center";
            ctx.fillText("BACK", cx, 10);
            ctx.fillText("FRONT", cx, size - 4);
        };

        const updateFromMouse = (e) => {
            const rect = canvas.getBoundingClientRect();
            // Scaling support (accounts for CSS zoom)
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const mouseX = (e.clientX - rect.left) * scaleX;
            const mouseY = (e.clientY - rect.top) * scaleY;
            const cx = size / 2;
            const cy = size / 2;

            let dx = (mouseX - cx);
            let dy = (mouseY - cy);

            const maxDrag = (size / 2) - 2;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > maxDrag) {
                dx *= maxDrag / dist;
                dy *= maxDrag / dist;
            }

            light.x = (dx / (size / 2)) * range;
            light.z = (dy / (size / 2)) * range;

            draw();
            this.applyLighting();
        };

        canvas.addEventListener("pointerdown", (e) => {
            canvas.setPointerCapture(e.pointerId);
            isDragging = true;
            updateFromMouse(e);
        });

        canvas.addEventListener("pointermove", (e) => {
            if (isDragging) updateFromMouse(e);
        });

        canvas.addEventListener("pointerup", (e) => {
            if (isDragging) {
                if (canvas.hasPointerCapture(e.pointerId)) {
                    canvas.releasePointerCapture(e.pointerId);
                }
                isDragging = false;
                this.syncToNode(false);
            }
        });

        draw();
        return canvas;
    }


    parseColorToHex(c) {
        if (!c) return "#ffffff";
        if (typeof c === 'string') return c.startsWith('#') ? c : "#ffffff";
        if (Array.isArray(c)) {
            const r = Math.round(c[0]).toString(16).padStart(2, '0');
            const g = Math.round(c[1]).toString(16).padStart(2, '0');
            const b = Math.round(c[2]).toString(16).padStart(2, '0');
            return `#${r}${g}${b}`;
        }
        return "#ffffff";
    }

    createColorField(label, key) {
        const field = document.createElement("div");
        field.className = "vnccs-ps-field";

        const labelEl = document.createElement("div");
        labelEl.className = "vnccs-ps-label";
        labelEl.innerText = label;

        const input = document.createElement("input");
        input.type = "color";
        input.className = "vnccs-ps-color";

        // Convert RGB to Hex
        const rgb = this.exportParams[key];
        const hex = "#" + ((1 << 24) + (rgb[0] << 16) + (rgb[1] << 8) + rgb[2]).toString(16).slice(1);
        input.value = hex;

        input.addEventListener("input", () => {
            const hex = input.value;
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            this.exportParams[key] = [r, g, b];
        });

        input.addEventListener("change", () => {
            this.syncToNode(true);
        });

        this.exportWidgets[key] = input;

        field.appendChild(labelEl);
        field.appendChild(input);
        return field;
    }

    resetCurrentPose() {
        if (this.viewer) {
            this.viewer.recordState(); // Undo support
            this.viewer.resetPose();
            this.updateRotationSliders();
        }
        this.poses[this.activeTab] = {};
        this.syncToNode(false);
    }

    loadReference() {
        if (this.fileRefInput) {
            this.fileRefInput.click();
        }
    }

    handleRefImport(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUrl = event.target.result;
            if (this.viewer) {
                this.viewer.loadReferenceImage(dataUrl);
                this.exportParams.background_url = dataUrl;
                this.syncToNode(false);

                // Force model update (preview button effect) to fix camera shift
                this.loadModel(false);

                if (this.refBtn) {
                    this.refBtn.innerHTML = '<span class="vnccs-ps-btn-icon">🗑️</span> Remove Background';
                    this.refBtn.classList.add('danger');
                }
            }
            e.target.value = '';
        };
        reader.readAsDataURL(file);
    }

    showMessage(text, isError = false) {
        const overlay = document.createElement('div');
        overlay.className = 'vnccs-ps-modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'vnccs-ps-modal';
        modal.style.maxWidth = "300px";

        const title = document.createElement('div');
        title.className = 'vnccs-ps-modal-title';
        title.textContent = isError ? '⚠️ 错误' : 'ℹ️ 信息';

        const content = document.createElement('div');
        content.className = 'vnccs-ps-modal-content';
        content.style.textAlign = 'center';
        content.textContent = text;

        const okBtn = document.createElement('button');
        okBtn.className = 'vnccs-ps-modal-btn';
        okBtn.style.justifyContent = 'center';
        okBtn.textContent = '确定';
        okBtn.onclick = () => overlay.remove();

        modal.appendChild(title);
        modal.appendChild(content);
        modal.appendChild(okBtn);
        overlay.appendChild(modal);

        this.canvasContainer.appendChild(overlay);
    }

    loadModel(showOverlay = true) {
        if (showOverlay && this.loadingOverlay) this.loadingOverlay.style.display = "flex";

        const modelId = String(this.exportParams.model_id || "").trim();
        if (!modelId) {
            if (this.loadingOverlay) this.loadingOverlay.style.display = "none";
            return Promise.resolve(null);
        }

        return api.fetchApi("/vnccs/character_studio/update_preview", {
            method: "POST",
            body: JSON.stringify({ model_id: modelId })
        }).then(async r => {
            const text = await r.text();
            let data = {};
            if (text) {
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    data = { detail: text };
                }
            }
            if (!r.ok) {
                const detail = data?.detail || data?.message || r.statusText || "请求失败";
                throw new Error(`VNCCS 模型加载失败 (${r.status}): ${detail}`);
            }
            return data;
        }).then(d => {
            if (this.viewer) {
                // Keep camera during updates
                this.viewer.loadData(d, true);

                // Apply lighting configuration
                this.viewer.updateLights(this.lightParams);

                // FORCE camera sync on every model change (as requested)
                this.viewer.snapToCaptureCamera(
                    this.exportParams.view_width,
                    this.exportParams.view_height,
                    this.exportParams.cam_zoom || DEFAULT_CAMERA_ZOOM,
                    this.exportParams.cam_offset_x || 0,
                    this.exportParams.cam_offset_y || 0
                );

                // Apply pose immediately (no timeout/flicker)
                if (this.viewer.initialized) {
                    this.viewer.setPose(this.poses[this.activeTab] || {}, true);
                    this.updateRotationSliders();
                    // Full recapture needed because mesh changed
                    this.syncToNode(true);
                }
            }
        }).finally(() => {
            if (this.loadingOverlay) this.loadingOverlay.style.display = "none";
        });
    }

    refreshLightUI() {
        if (!this.lightListContainer) return;
        this.lightListContainer.innerHTML = '';

        const isOverridden = this.exportParams.keepOriginalLighting;
        this.lightListContainer.style.opacity = isOverridden ? "0.3" : "1.0";
        this.lightListContainer.style.pointerEvents = isOverridden ? "none" : "auto";
        this.lightListContainer.title = isOverridden ? "灯光被 '保持原始灯光' 模式覆盖" : "";

        this.lightParams.forEach((light, index) => {
            const item = document.createElement('div');
            item.className = 'vnccs-ps-light-card';

            // --- Header ---
            const header = document.createElement('div');
            header.className = 'vnccs-ps-light-header';

            const title = document.createElement('span');
            title.className = 'vnccs-ps-light-title';

            // Icon
            let iconChar = '💡';
            if (light.type === 'directional') iconChar = '☀️';
            else if (light.type === 'ambient') iconChar = '☁️';

            title.innerHTML = `<span class="vnccs-ps-light-icon">${iconChar}</span> 灯光 ${index + 1}`;

            const removeBtn = document.createElement('button');
            removeBtn.className = 'vnccs-ps-light-remove';
            removeBtn.innerHTML = '×';
            removeBtn.title = "移除灯光";
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                this.lightParams.splice(index, 1);
                this.refreshLightUI();
                this.applyLighting();
            };

            header.appendChild(title);
            header.appendChild(removeBtn);
            item.appendChild(header);

            // --- Body ---
            const body = document.createElement('div');
            body.className = 'vnccs-ps-light-body';

            // Grid 1: Type & Color
            const grid1 = document.createElement('div');
            grid1.className = 'vnccs-ps-light-grid';

            // Type
            const typeSelect = document.createElement('select');
            typeSelect.className = 'vnccs-ps-light-select';
            const lightTypeNames = {
                'ambient': '环境光',
                'directional': '定向光',
                'point': '点光源'
            };
            ['ambient', 'directional', 'point'].forEach(t => {
                const opt = document.createElement('option');
                opt.value = t;
                opt.textContent = lightTypeNames[t];
                if (t === light.type) opt.selected = true;
                typeSelect.appendChild(opt);
            });
            typeSelect.onchange = () => {
                light.type = typeSelect.value;
                this.refreshLightUI();
                this.applyLighting();
            };
            grid1.appendChild(typeSelect);

            // Color
            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.className = 'vnccs-ps-light-color';
            colorInput.value = light.color || '#ffffff';
            colorInput.oninput = (e) => {
                light.color = colorInput.value;
                clearTimeout(this.colorTimeout);
                this.colorTimeout = setTimeout(() => this.applyLighting(), 50);
            };
            grid1.appendChild(colorInput);
            body.appendChild(grid1);

            // Intensity
            const intensityRow = document.createElement('div');
            intensityRow.className = 'vnccs-ps-light-slider-row';

            const intLabel = document.createElement('span');
            intLabel.className = 'vnccs-ps-light-pos-label';
            intLabel.innerText = "强度";

            const isAmbient = light.type === 'ambient';
            const intSlider = document.createElement('input');
            intSlider.type = 'range';
            intSlider.className = 'vnccs-ps-light-slider';
            intSlider.min = 0;
            intSlider.max = isAmbient ? 2 : 5;
            intSlider.step = isAmbient ? 0.01 : 0.1;
            intSlider.value = light.intensity ?? (isAmbient ? 0.5 : 1);

            const intValue = document.createElement('span');
            intValue.className = 'vnccs-ps-light-value';
            intValue.innerText = parseFloat(intSlider.value).toFixed(2);

            intSlider.oninput = () => {
                light.intensity = parseFloat(intSlider.value);
                intValue.innerText = light.intensity.toFixed(2);
                this.applyLighting();
            };

            intensityRow.appendChild(intLabel);
            intensityRow.appendChild(intSlider);
            intensityRow.appendChild(intValue);
            body.appendChild(intensityRow);

            // Radius Slider (Point Light Only)
            if (light.type === 'point') {
                const radiusRow = document.createElement('div');
                radiusRow.className = 'vnccs-ps-light-slider-row';

                const radLabel = document.createElement('span');
                radLabel.className = 'vnccs-ps-light-pos-label';
                radLabel.innerText = "半径";

                const radSlider = document.createElement('input');
                radSlider.type = 'range';
                radSlider.className = 'vnccs-ps-light-slider';
                radSlider.min = 5; radSlider.max = 300; radSlider.step = 1;
                radSlider.value = light.radius ?? 100;

                const radValue = document.createElement('span');
                radValue.className = 'vnccs-ps-light-value';
                radValue.innerText = radSlider.value;

                radSlider.oninput = () => {
                    light.radius = parseFloat(radSlider.value);
                    radValue.innerText = radSlider.value;
                    this.applyLighting();
                };

                radiusRow.appendChild(radLabel);
                radiusRow.appendChild(radSlider);
                radiusRow.appendChild(radValue);
                body.appendChild(radiusRow);
            }

            // Position Controls (if not Ambient)
            if (light.type !== 'ambient') {
                const radarWrap = document.createElement('div');
                radarWrap.className = 'vnccs-ps-light-radar-wrap';

                const radarMain = document.createElement('div');
                radarMain.className = 'vnccs-ps-light-radar-main';

                // Radar (X and Z - Top Down)
                const radar = this.createLightRadar(light);
                radarMain.appendChild(radar);

                // Height Slider (Y) - Vertical
                const hVertWrap = document.createElement('div');
                hVertWrap.className = 'vnccs-ps-light-slider-vert-wrap';

                const hLabel = document.createElement('span');
                hLabel.className = 'vnccs-ps-light-h-label';
                hLabel.innerText = "Y-高度";

                const hVal = document.createElement('span');
                hVal.className = 'vnccs-ps-light-h-val';
                hVal.innerText = light.y || 0;

                const hSlider = document.createElement('input');
                hSlider.type = 'range';
                hSlider.className = 'vnccs-ps-light-slider-vert';
                hSlider.setAttribute('orient', 'vertical'); // Firefox support
                const isPoint = light.type === 'point';
                hSlider.min = isPoint ? -10 : -100;
                hSlider.max = isPoint ? 10 : 100;
                hSlider.step = isPoint ? 0.1 : 1;
                hSlider.value = light.y || 0;

                hSlider.oninput = () => {
                    light.y = parseFloat(hSlider.value);
                    hVal.innerText = hSlider.value;
                    this.applyLighting();
                };

                hVertWrap.appendChild(hVal);
                hVertWrap.appendChild(hSlider);
                hVertWrap.appendChild(hLabel);

                radarMain.appendChild(hVertWrap);
                radarWrap.appendChild(radarMain);
                body.appendChild(radarWrap);
            }

            item.appendChild(body);
            this.lightListContainer.appendChild(item);
        });

        // Add Light Button (Big)
        const addBtn = document.createElement('button');
        addBtn.className = 'vnccs-ps-btn-add-large';
        addBtn.innerHTML = '+ 添加光源';
        addBtn.disabled = isOverridden;
        if (isOverridden) {
            addBtn.style.opacity = "0.5";
            addBtn.style.cursor = "not-allowed";
        }
        addBtn.onclick = () => {
            this.lightParams.push({
                type: 'directional',
                color: '#ffffff',
                intensity: 1.0,
                x: 0, y: 0, z: 5
            });
            this.refreshLightUI();
            this.applyLighting();
        };
        this.lightListContainer.appendChild(addBtn);
    }

    applyLighting() {
        if (this.viewer && this.viewer.initialized) {
            if (this.exportParams.keepOriginalLighting) {
                // Override: Clean white render with 1.0 ambient only
                this.viewer.updateLights([{ type: 'ambient', color: '#ffffff', intensity: 1.0 }]);
            } else {
                // Manual/User lights
                this.viewer.updateLights(this.lightParams);
            }
        }

        // Lightweight state sync without capture, debounced to prevent UI lag during drag.
        clearTimeout(this.lightingQuickSyncTimeout);
        this.lightingQuickSyncTimeout = setTimeout(() => {
            this.syncToNode(false);
        }, 100);

        // Debounce full capture (previews) to avoid lag/shaking during drag
        clearTimeout(this.lightingSyncTimeout);
        this.lightingSyncTimeout = setTimeout(() => {
            this.syncToNode(true);
        }, 500);
    }

    updateRotationSliders() {
        if (!this.viewer) return;
        const r = this.viewer.modelRotation;
        ['x', 'y', 'z'].forEach(axis => {
            const info = this.sliders[`rot_${axis}`];
            if (info) {
                info.slider.value = r[axis];
                info.label.innerText = `${r[axis]}°`;
            }
        });
    }

    resize() {
        if (this.viewer && this.canvasContainer) {
            // Always measure the actual canvas container to ensure perfect aspect ratio.
            // rect.width is in screen pixels, divide by zoom factor to get logical CSS pixels for Three.js.
            const rect = this.canvasContainer.getBoundingClientRect();
            const zoomFactor = POSE_STUDIO_UI_ZOOM;
            const targetW = Math.round(rect.width / zoomFactor);
            const targetH = Math.round(rect.height / zoomFactor);

            // Guard against feedback loops: skip if size hasn't materially changed.
            // Without this, getBoundingClientRect → setSize → style change → rect grows → infinite loop
            // on some systems with non-integer DPI or zoom scaling.
            if (targetW > 1 && targetH > 1) {
                const dw = Math.abs(targetW - (this._lastResizeW || 0));
                const dh = Math.abs(targetH - (this._lastResizeH || 0));
                if (dw < 2 && dh < 2) return; // No meaningful change

                this._lastResizeW = targetW;
                this._lastResizeH = targetH;
                this.viewer.resize(targetW, targetH);
            }
        }
    }

    syncToNode(fullCapture = false) {
        if (this.radarRedraw) this.radarRedraw();

        // Save current pose before syncing
        if (this.viewer && this.viewer.initialized) {
            this.poses[this.activeTab] = this.viewer.getPose();
        }

        // Cache Handling
        if (!this.poseCaptures) this.poseCaptures = [];

        // Ensure size
        while (this.poseCaptures.length < this.poses.length) this.poseCaptures.push(null);
        while (this.poseCaptures.length > this.poses.length) this.poseCaptures.pop();

        // Capture Image (CSR)
        if (this.viewer && this.viewer.initialized) {
            const w = this.exportParams.view_width || 1024;
            const h = this.exportParams.view_height || 1024;
            const bg = this.exportParams.bg_color || [40, 40, 40];

            const isOriginalLighting = this.exportParams.keepOriginalLighting;
            const userLights = JSON.parse(JSON.stringify(this.lightParams));

            if (fullCapture) {
                const originalTab = this.activeTab;

                for (let i = 0; i < this.poses.length; i++) {
                    this.activeTab = i;
                    this.viewer.setPose(this.poses[i]);
                    const z = this.exportParams.cam_zoom || DEFAULT_CAMERA_ZOOM;
                    const oX = this.exportParams.cam_offset_x || 0;
                    const oY = this.exportParams.cam_offset_y || 0;

                    if (isOriginalLighting) {
                        this.viewer.updateLights([{ type: 'ambient', color: '#ffffff', intensity: 1.0 }]);
                    } else {
                        this.viewer.updateLights(this.lightParams);
                    }

                    this.poseCaptures[i] = this.viewer.capture(w, h, z, bg, oX, oY);
                }

                this.viewer.updateLights(userLights);
                this.activeTab = originalTab;
                this.viewer.setPose(this.poses[this.activeTab]);

                const z = this.exportParams.cam_zoom || DEFAULT_CAMERA_ZOOM;
                const oX = this.exportParams.cam_offset_x || 0;
                const oY = this.exportParams.cam_offset_y || 0;
                this.viewer.updateCaptureCamera(w, h, z, oX, oY);
            } else {
                const z = this.exportParams.cam_zoom || DEFAULT_CAMERA_ZOOM;
                const oX = this.exportParams.cam_offset_x || 0;
                const oY = this.exportParams.cam_offset_y || 0;

                if (isOriginalLighting) {
                    this.viewer.updateLights([{ type: 'ambient', color: '#ffffff', intensity: 1.0 }]);
                } else {
                    this.viewer.updateLights(this.lightParams);
                }

                this.poseCaptures[this.activeTab] = this.viewer.capture(w, h, z, bg, oX, oY);
                if (isOriginalLighting) this.viewer.updateLights(userLights);
            }
        }

        // Update hidden pose_data widget
        // Exclude background_url from export to avoid inflating pose_data widget
        const exportToSave = {
            ...this.exportParams
        };
        delete exportToSave.background_url;

        const data = {
            export: exportToSave,
            poses: this.poses,
            lights: this.lightParams,
            activeTab: this.activeTab,
            captured_images: this.poseCaptures,
            background_url: this.exportParams.background_url || null
        };

        const widget = this.node.widgets?.find(w => w.name === "pose_data");
        if (widget) {
            widget.value = JSON.stringify(data);
        }
    }

    loadFromNode() {
        // Load from pose_data widget
        const widget = this.node.widgets?.find(w => w.name === "pose_data");
        if (!widget || !widget.value) return null;

        try {
            const data = JSON.parse(widget.value);

            if (data.export) {
                this.exportParams = { ...this.exportParams, ...data.export };
                // Update export widgets
                for (const [key, widget] of Object.entries(this.exportWidgets)) {
                    if (key === 'camera_resolution') {
                        if (widget.update) widget.update();
                        continue;
                    }
                    if (key === 'bg_color') {
                        const rgb = this.exportParams.bg_color;
                        const hex = "#" + ((1 << 24) + (rgb[0] << 16) + (rgb[1] << 8) + rgb[2]).toString(16).slice(1);
                        widget.value = hex;
                    } else if (this.exportParams[key] !== undefined) {
                        if (widget.update) {
                            widget.update(this.exportParams[key]);
                        } else {
                            widget.value = this.exportParams[key];
                        }
                    }
                }
            }
            if (this.updateOverrideBtn) this.updateOverrideBtn();

            if (data.poses && Array.isArray(data.poses)) {
                this.poses = data.poses.length ? data.poses : [{}];
            }

            // Restore background image if present
            const bgUrl = data.background_url || this.exportParams.background_url;
            if (bgUrl && this.viewer) {
                this.exportParams.background_url = bgUrl;
                this.viewer.loadReferenceImage(bgUrl);
                if (this.refBtn) {
                    this.refBtn.innerHTML = '<span class="vnccs-ps-btn-icon">🗑️</span> Remove Background';
                    this.refBtn.classList.add('danger');
                }
            }

            if (data.lights && Array.isArray(data.lights)) {
                this.lightParams = data.lights;
                this.refreshLightUI();
                if (this.viewer) {
                    this.viewer.updateLights(this.lightParams);
                }
            }

            if (typeof data.activeTab === 'number') {
                this.activeTab = Math.max(0, Math.min(data.activeTab, this.poses.length - 1));
            }

            if (data.captured_images && Array.isArray(data.captured_images)) {
                this.poseCaptures = data.captured_images;
            }

            return this.exportParams.model_id ? this.loadModel() : null;

        } catch (e) {
            console.error("Failed to parse pose_data:", e);
        }

        return null;
    }

    loadGeneratedModel(modelId) {
        const cleanId = String(modelId || "").trim();
        if (!cleanId) return Promise.resolve(null);
        this.exportParams.model_id = cleanId;
        this.poses = [{}];
        this.activeTab = 0;
        this.poseCaptures = [];
        return this.loadModel(true);
    }


}


// === ComfyUI Extension Registration ===
app.registerExtension({
    name: "VNCCS.PoseStudio",

    setup() {},

    async beforeRegisterNodeDef(nodeType, nodeData, _app) {
        if (nodeData.name !== "VNCCS_PoseStudio") return;

        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (onCreated) onCreated.apply(this, arguments);

            this.setSize([900, 740]);

            // Create widget
            this.studioWidget = new PoseStudioWidget(this);

            this.addDOMWidget("pose_studio_ui", "ui", this.studioWidget.container, {
                serialize: false,
                hideOnZoom: false
            });


            // Hide pose_data widget (must work in both legacy LiteGraph and node2.0 Vue modes)
            const poseWidget = this.widgets?.find(w => w.name === "pose_data");
            if (poseWidget) {
                // Legacy LiteGraph mode
                poseWidget.type = "hidden";
                poseWidget.computeSize = () => [0, -4];
                // Node 2.0 Vue mode
                poseWidget.hidden = true;
                // Hide DOM element if it exists (node2.0 creates input elements)
                if (poseWidget.element) {
                    poseWidget.element.style.display = "none";
                }
            }
            // Load model after initialization
            setTimeout(() => {
                const loadPromise = this.studioWidget.loadFromNode() || Promise.resolve(null);
                Promise.resolve(loadPromise).then(() => {
                    // Auto-center camera on initialization
                    if (this.studioWidget.viewer) {
                        this.studioWidget.viewer.snapToCaptureCamera(
                            this.studioWidget.exportParams.view_width,
                            this.studioWidget.exportParams.view_height,
                            this.studioWidget.exportParams.cam_zoom || DEFAULT_CAMERA_ZOOM,
                            this.studioWidget.exportParams.cam_offset_x || 0,
                            this.studioWidget.exportParams.cam_offset_y || 0
                        );
                        // Force resize again after model load to ensure Three.js matches container
                        this.studioWidget.resize();
                    }
                });
                // Force a resize after initialization to fix stretching
                this.onResize(this.size);
            }, 800);
        };

        nodeType.prototype.onResize = function (size) {
            if (this.studioWidget) {
                // DON'T set container dimensions - let it fill naturally
                // Just trigger the viewer resize
                clearTimeout(this.resizeTimer);
                this.resizeTimer = setTimeout(() => {
                    this.studioWidget.resize();
                }, 50);
            }
        };

        // Save state on configure
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            if (onConfigure) onConfigure.apply(this, arguments);

            if (this.studioWidget) {
                setTimeout(() => {
                    this.studioWidget.loadFromNode();
                    this.onResize(this.size); // Force correct aspect ratio on config
                }, 500);
            }
        };

    }
});
