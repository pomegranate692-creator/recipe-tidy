/* Recipe Snap — saving things on this device.
 * Small data (recipes, settings, grocery list) → localStorage.
 * Pictures (dish photos, original scans) → IndexedDB, which can hold much more. */
(function () {
  'use strict';
  const memory = {};
  const kv = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return k in memory ? memory[k] : d; } },
    set(k, v) { memory[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };

  let dbp = null;
  function db() {
    if (!dbp) {
      dbp = new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) return reject(new Error('no indexedDB'));
        const req = indexedDB.open('recipe-snap', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('blobs');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }).catch(e => { dbp = null; throw e; });
    }
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(d => new Promise((resolve, reject) => {
      const t = d.transaction('blobs', mode);
      const r = fn(t.objectStore('blobs'));
      t.oncomplete = () => resolve(r && r.result);
      t.onerror = () => reject(t.error);
    }));
  }
  const blobs = {
    put: (key, blob) => tx('readwrite', s => s.put(blob, key)).catch(() => null),
    get: key => tx('readonly', s => s.get(key)).catch(() => null),
    del: key => tx('readwrite', s => s.delete(key)).catch(() => null),
    keys: () => tx('readonly', s => s.getAllKeys()).catch(() => [])
  };

  // Shrink a photo so it saves quickly and doesn't fill the phone.
  async function shrink(fileOrBlob, maxSide, quality) {
    try {
      const bmp = await createImageBitmap(fileOrBlob);
      const scale = Math.min(1, (maxSide || 1200) / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return await new Promise(res => c.toBlob(b => res(b || fileOrBlob), 'image/jpeg', quality || 0.82));
    } catch (e) { return fileOrBlob; }
  }

  const urlCache = new Map();
  async function photoURL(key) {
    if (urlCache.has(key)) return urlCache.get(key);
    const b = await blobs.get(key);
    const u = b ? URL.createObjectURL(b) : '';
    urlCache.set(key, u);
    return u;
  }
  function forget(key) { const u = urlCache.get(key); if (u) URL.revokeObjectURL(u); urlCache.delete(key); }

  const toDataURL = blob => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(''); r.readAsDataURL(blob); });
  const fromDataURL = async url => (await fetch(url)).blob();

  window.SnapStore = { kv, blobs, shrink, photoURL, forget, toDataURL, fromDataURL };
})();
