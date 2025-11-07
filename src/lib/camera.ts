export function detectCameraSupport(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & {
    mediaDevices?: MediaDevices & {
      getUserMedia?: MediaDevices['getUserMedia'];
    };
    webkitGetUserMedia?: MediaDevices['getUserMedia'];
    mozGetUserMedia?: MediaDevices['getUserMedia'];
    getUserMedia?: MediaDevices['getUserMedia'];
  };

  if (nav.mediaDevices) {
    const devices = nav.mediaDevices as MediaDevices & {
      getUserMedia?: MediaDevices['getUserMedia'];
    };
    if (typeof devices.getUserMedia === 'function') {
      return true;
    }
    if ('getUserMedia' in devices) {
      return true;
    }
  }

  if (typeof nav.getUserMedia === 'function') return true;
  if (typeof nav.webkitGetUserMedia === 'function') return true;
  if (typeof nav.mozGetUserMedia === 'function') return true;

  return false;
}
