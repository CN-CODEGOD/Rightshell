// Acrylic glass material, Windows Terminal style.
//  - Windows 11 22H2+: native BrowserWindow backgroundMaterial 'acrylic'
//  - Windows 10: DWM SetWindowCompositionAttribute ACCENT_ENABLE_ACRYLICBLURBEHIND
//    through koffi (prebuilt FFI, no compiler needed)
// Degrades gracefully to an opaque modern surface when neither is available.
const { app } = require('electron');

const WCA_ACCENT_POLICY = 19;
const ACCENT_ENABLE_ACRYLICBLURBEHIND = 4;

let koffi = null;
let setWindowCompositionAttribute = null;
let AccentPolicy = null;
let WinCompAttrData = null;
let ffiReady = false;

function initFfi() {
  if (ffiReady) return true;
  try {
    koffi = require('koffi');
    AccentPolicy = koffi.struct('AccentPolicy', {
      AccentState: 'uint32',
      AccentFlags: 'uint32',
      GradientColor: 'uint32',
      AnimationId: 'uint32',
    });
    // pData is PVOID in the real API; typing it as AccentPolicy* lets koffi
    // marshal the nested JS object to a native struct pointer automatically.
    WinCompAttrData = koffi.struct('WinCompAttrData', {
      Attrib: 'uint32',
      pData: koffi.pointer(AccentPolicy),
      cbData: 'uint32',
    });
    const user32 = koffi.load('user32.dll');
    setWindowCompositionAttribute = user32.func(
      'bool __stdcall SetWindowCompositionAttribute(void *hwnd, WinCompAttrData *data)'
    );
    ffiReady = true;
  } catch (err) {
    console.warn('[acrylic] FFI unavailable, falling back to opaque:', err.message);
    ffiReady = false;
  }
  return ffiReady;
}

function isWin11AcrylicCapable() {
  const v = (process.getSystemVersion() || '').split('.').map(Number);
  return v[0] > 10 || (v[0] === 10 && v[2] >= 22621);
}

// gradientColor is ABGR: alpha<<24 | blue<<16 | green<<8 | red
function applyDwmAcrylic(hwndBuffer, tintHex, alpha) {
  if (!initFfi()) return false;
  try {
    const hex = (tintHex || '#101418').replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
    const policy = {
      AccentState: ACCENT_ENABLE_ACRYLICBLURBEHIND,
      AccentFlags: 0,
      GradientColor: ((a << 24) | (b << 16) | (g << 8) | r) >>> 0,
      AnimationId: 0,
    };
    const data = {
      Attrib: WCA_ACCENT_POLICY,
      pData: policy,
      cbData: koffi.sizeof(AccentPolicy),
    };
    return !!setWindowCompositionAttribute(hwndBuffer, data);
  } catch (err) {
    console.warn('[acrylic] DWM call failed:', err.message);
    return false;
  }
}

// Returns the effective material mode: 'acrylic' | 'opaque'.
function applyToWindow(win, { tint = '#101418', alpha = 0.72 } = {}) {
  if (!win || win.isDestroyed()) return 'opaque';
  if (isWin11AcrylicCapable()) {
    try {
      win.setBackgroundMaterial('acrylic');
      win.setBackgroundColor('#00000000');
      return 'acrylic';
    } catch {
      /* fall through to DWM */
    }
  }
  const hwnd = win.getNativeWindowHandle();
  if (applyDwmAcrylic(hwnd, tint, alpha)) return 'acrylic';
  return 'opaque';
}

module.exports = { applyToWindow, isWin11AcrylicCapable };