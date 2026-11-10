function loadElement(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = async () => {
      try { await image.decode(); } catch { /* A loaded HTML image is drawable. */ }
      resolve(image);
    };
    image.onerror = () => reject(new Error('Could not load flight photograph'));
    image.src = url;
  });
}

export function createFlightPhotoLoader(forWebGL, imageRoot = new URL('./assets/geo/', import.meta.url)) {
  const pending = new Map();
  let worker;

  function closeWorker() {
    worker?.terminate();
    worker = null;
    for (const request of pending.values()) request.reject();
    pending.clear();
  }

  if (forWebGL && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'
      && typeof createImageBitmap === 'function') {
    try {
      worker = new Worker(new URL('./flight-photo-worker.js?v=14', import.meta.url));
      worker.onmessage = ({ data: { file, surface, failed } }) => {
        const request = pending.get(file);
        if (!request) { surface?.close(); return; }
        pending.delete(file);
        if (failed) request.reject();
        else request.resolve(surface);
      };
      worker.onerror = closeWorker;
      worker.onmessageerror = closeWorker;
    } catch { /* Use the browser's image loader when workers are unavailable. */ }
  }

  let disposed = false;
  return {
    async load(file) {
      const url = new URL(file, imageRoot).href;
      if (worker) {
        try {
          return await new Promise((resolve, reject) => {
            pending.set(file, { resolve, reject });
            worker.postMessage({ file, url });
          });
        } catch { /* Decode this image in the page if worker delivery failed. */ }
      }
      if (disposed) throw new Error('Flight closed');
      if (forWebGL && typeof createImageBitmap === 'function') {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error('Could not load photograph');
          return await createImageBitmap(await response.blob(), {
            imageOrientation: 'flipY', premultiplyAlpha: 'none'
          });
        } catch { /* Older browsers can still display their native image element. */ }
      }
      return loadElement(url);
    },
    dispose() {
      disposed = true;
      closeWorker();
    }
  };
}
