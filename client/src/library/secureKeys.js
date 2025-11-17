export async function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("secureKeysDB", 1);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("keys")) {
        console.log("🗝️ Creating object store 'keys'...");
        db.createObjectStore("keys", { keyPath: "id" });
      }
    };

    request.onsuccess = (e) => {
      resolve(e.target.result);
    };

    request.onerror = (e) => {
      console.error("❌ IndexedDB open error:", e.target.error);
      reject(e.target.error);
    };
  });
}

export async function savePrivateKeyToIndexedDB(privateKey) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction("keys", "readwrite");
      tx.objectStore("keys").put({ id: "privateKey", key: privateKey });
      tx.oncomplete = () => {
        console.log("✅ Private key saved to IndexedDB");
        resolve(true);
      };
      tx.onerror = (e) => {
        console.error("❌ Failed to save key:", e.target.error);
        reject(e.target.error);
      };
    } catch (err) {
      console.error("❌ savePrivateKey error:", err);
      reject(err);
    }
  });
}

export async function getPrivateKeyFromIndexedDB() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction("keys", "readonly");
      const req = tx.objectStore("keys").get("privateKey");
      req.onsuccess = () => {
        const res = req.result ? req.result.key : null;
        console.log(res ? "✅ Private key found" : "⚠️ No private key in IndexedDB");
        resolve(res);
      };
      req.onerror = (e) => {
        console.error("❌ getPrivateKey error:", e.target.error);
        reject(e.target.error);
      };
    } catch (err) {
      console.error("❌ getPrivateKey transaction error:", err);
      reject(err);
    }
  });
}
