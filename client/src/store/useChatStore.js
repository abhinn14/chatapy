import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../library/axios.js";
import { useStore } from "./store.js";

/* ---------------- Crypto helpers ---------------- */

function u8ToBase64(u8) {
  let binary = "";
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
  return btoa(binary);
}

function base64ToU8(b64) {
  const binary = atob(b64);
  const len = binary.length;
  const u8 = new Uint8Array(len);
  for (let i = 0; i < len; i++) u8[i] = binary.charCodeAt(i);
  return u8;
}

async function generateECDHKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  );
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  console.log("🔑 [Crypto] Generated ECDH key pair");
  return { keyPair, publicKeyJwk };
}

async function importPublicKey(jwk) {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );
}

async function deriveAESKey(privateKey, remotePublicKey) {
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: remotePublicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptMessage(plain, aesKey) {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, encoder.encode(plain));
  const ctU8 = new Uint8Array(ct);
  return { iv: u8ToBase64(iv), ciphertext: u8ToBase64(ctU8) };
}

async function decryptMessage({ iv, ciphertext }, aesKey) {
  const decoder = new TextDecoder();
  const ivU8 = base64ToU8(iv);
  const ctU8 = base64ToU8(ciphertext);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivU8 }, aesKey, ctU8);
  return decoder.decode(pt);
}

/* ---------------- Helper ---------------- */

function normalizeId(msg) {
  if (!msg) return null;
  return String(msg._id || msg.id || msg.messageId || "");
}

/* ---------------- Zustand store ---------------- */

export const useChatStore = create((set, get) => ({
  messages: [],
  users: [],
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,

  keyPair: null,
  publicKeyJwk: null,
  aesKeys: {}, // userId -> CryptoKey
  cryptoInitialized: false,

  /* initCrypto */
  initCrypto: async () => {
    if (get().cryptoInitialized) return;

    const { authUser } = useStore.getState();
    if (!authUser) return;

    const privJwkStr = localStorage.getItem(`privkey_${authUser._id}`);
    let keyPair = null;
    let publicKeyJwk = null;

    if (privJwkStr) {
      try {
        const privJwk = JSON.parse(privJwkStr);
        const privateKey = await crypto.subtle.importKey(
          "jwk",
          privJwk,
          { name: "ECDH", namedCurve: "P-256" },
          true,
          ["deriveKey"]
        );
        keyPair = { privateKey, publicKey: null };

        const localPub = localStorage.getItem(`pubkey_${authUser._id}`);
        if (localPub) {
          publicKeyJwk = JSON.parse(localPub);
        } else {
          try {
            const res = await axiosInstance.get(`/auth/user/${authUser._id}/public-key`);
            publicKeyJwk = res.data || null;
          } catch {
            publicKeyJwk = null;
          }
        }
      } catch {
        console.warn("Failed to import private key, regenerating new one");
      }
    }

    if (!keyPair) {
      const gen = await generateECDHKeyPair();
      keyPair = gen.keyPair;
      publicKeyJwk = gen.publicKeyJwk;
      const privJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
      localStorage.setItem(`privkey_${authUser._id}`, JSON.stringify(privJwk));
      localStorage.setItem(`pubkey_${authUser._id}`, JSON.stringify(publicKeyJwk));
      try {
        await axiosInstance.post("/auth/upload-public-key", { publicKeyJwk });
      } catch (e) {
        console.warn("Failed to upload public key:", e?.message || e);
      }
    }

    set({ keyPair, publicKeyJwk, cryptoInitialized: true });

    const socket = useStore.getState().socket;
    if (socket) {
      socket.off("receive-public-key");
      socket.on("receive-public-key", async ({ from, publicKey }) => {
        try {
          const imported = await importPublicKey(publicKey);
          const aesKey = await deriveAESKey(get().keyPair.privateKey, imported);
          set((s) => ({ aesKeys: { ...s.aesKeys, [from]: aesKey } }));
          const ourPub = get().publicKeyJwk;
          if (ourPub) socket.emit("send-public-key", { to: from, publicKey: ourPub });
        } catch (err) {
          console.warn("Error handling receive-public-key:", err);
        }
      });
    }
  },

  /* getUsers */
  getUsers: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/message/users");
      set({ users: res.data });
    } catch (e) {
      toast.error(e.response?.data?.message || e.message);
    } finally {
      set({ isUsersLoading: false });
    }
  },

  /* getMessages */
  getMessages: async (userId) => {
    try {
      set({ isMessagesLoading: true });
      await get().initCrypto();
      const res = await axiosInstance.get(`/message/${userId}`);
      const msgs = res.data || [];
      const localPrivate = get().keyPair?.privateKey;

      const processed = await Promise.all(
        msgs.map(async (msg) => {
          let spub = msg.senderPublicKeyJwk;
          if (typeof spub === "string") {
            try {
              spub = JSON.parse(spub);
            } catch {
              spub = null;
            }
          }

          const cachedKey = get().aesKeys?.[userId];
          if (cachedKey && msg.encrypted?.iv) {
            try {
              const pt = await decryptMessage(msg.encrypted, cachedKey);
              return { ...msg, text: pt };
            } catch {}
          }

          if (spub && localPrivate && msg.encrypted) {
            try {
              const remote = await importPublicKey(spub);
              const derived = await deriveAESKey(localPrivate, remote);
              set((s) => ({ aesKeys: { ...s.aesKeys, [userId]: derived } }));
              const pt = await decryptMessage(msg.encrypted, derived);
              return { ...msg, text: pt };
            } catch {}
          }

          return { ...msg, text: "🔒 Encrypted Message" };
        })
      );

      set({ messages: processed, isMessagesLoading: false });
    } catch (e) {
      console.error("Error in getMessages:", e);
      set({ isMessagesLoading: false });
    }
  },

  /* setSelectedUser */
  setSelectedUser: async (user) => {
    set({ selectedUser: user, messages: [], isMessagesLoading: true });
    await get().initCrypto();
    const { publicKeyJwk, aesKeys } = get();
    const socket = useStore.getState().socket;

    if (publicKeyJwk && socket && !aesKeys[user._id]) {
      socket.emit("send-public-key", { to: user._id, publicKey: publicKeyJwk });
    }

    await get().getMessages(user._id);
  },

  /* sendMessage */
  sendMessage: async (text) => {
    const { selectedUser } = get();
    if (!selectedUser) return;

    const key = await waitForAESKey(selectedUser._id, 1500, { tryOfflineDerive: true });
    if (!key) {
      toast.error("Encryption key not ready!");
      return;
    }

    try {
      const encrypted = await encryptMessage(text, key);
      const pubJwk = get().publicKeyJwk;
      const res = await axiosInstance.post(`/message/send/${selectedUser._id}`, {
        encrypted,
        senderPublicKeyJwk: pubJwk,
      });

      const decryptedText = await decryptMessage(res.data.encrypted, key);
      set({ messages: [...get().messages, { ...res.data, text: decryptedText }] });
    } catch (e) {
      console.error("[sendMessage] error:", e);
      toast.error(e.response?.data?.message || e.message || "Send failed");
    }
  },

  /* subscribeToMessages */
  subscribeToMessages: () => {
    const socket = useStore.getState().socket;
    if (!socket) return;

    socket.off("newMessage");
    socket.on("newMessage", async ({ from, msg }) => {
      try {
        const authUser = useStore.getState().authUser;
        // Ignore echoes of messages sent by *this* client (prevents overwrite/race)
        if (authUser && String(from) === String(authUser._id)) {
          // optionally: you could still merge some non-text fields here if needed
          return;
        }

        // normal incoming-message flow for messages from other users
        const curMsgs = get().messages || [];
        const incomingId = normalizeId(msg);
        const existsIndex = curMsgs.findIndex((m) => normalizeId(m) === incomingId);

        if (existsIndex !== -1) {
          // existing message from other user — try to update text only if decrypt succeeds
          const oldMsg = curMsgs[existsIndex];
          let updated = [...curMsgs];

          try {
            const liveKey = await waitForAESKey(from, 300, { tryOfflineDerive: false });
            if (liveKey && msg.encrypted?.iv) {
              const text = await decryptMessage(msg.encrypted, liveKey);
              updated[existsIndex] = { ...oldMsg, ...msg, text };
              set({ messages: updated });
            }
            // if decrypt failed: keep existing text (do not downgrade)
          } catch (e) {
            console.warn("Decrypt failed while updating existing incoming message:", e);
          }
          return;
        }

        // brand new message from another user
        try {
          const liveKey = await waitForAESKey(from, 300, { tryOfflineDerive: false });
          if (liveKey && msg.encrypted?.iv) {
            const text = await decryptMessage(msg.encrypted, liveKey);
            set({ messages: [...curMsgs, { ...msg, text }] });
            return;
          }
        } catch (e) {
          console.warn("Live decrypt failed for new incoming message:", e);
        }

        // fallback: append locked placeholder
        set({ messages: [...curMsgs, { ...msg, text: "🔒 Encrypted Message" }] });
      } catch (outer) {
        console.error("subscribeToMessages handler error:", outer);
      }
    });
  },

  unsubscribeFromMessages: () => {
    const socket = useStore.getState().socket;
    if (socket) socket.off("newMessage");
  },
}));

/* ---------------- waitForAESKey ---------------- */
async function waitForAESKey(userId, timeoutMs = 2000, options = { tryOfflineDerive: true }) {
  const start = Date.now();
  const getState = () => useChatStore.getState();
  const setState = (patch) => useChatStore.setState(patch);

  const existing = getState().aesKeys?.[userId];
  if (existing) return existing;

  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      const key = getState().aesKeys?.[userId];
      if (key) {
        clearInterval(interval);
        resolve(key);
        return;
      }

      if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        if (!options.tryOfflineDerive) return resolve(null);

        try {
          const localPrivate = getState().keyPair?.privateKey;
          if (!localPrivate) return resolve(null);

          const resp = await axiosInstance.get(`/auth/user/${userId}/public-key`);
          const peerPub = resp?.data;
          if (!peerPub) return resolve(null);

          const imported = await importPublicKey(peerPub);
          const derived = await deriveAESKey(localPrivate, imported);
          setState((s) => ({ aesKeys: { ...(s.aesKeys || {}), [userId]: derived } }));
          return resolve(derived);
        } catch (err) {
          console.warn("waitForAESKey fallback failed:", err);
          return resolve(null);
        }
      }
    }, 50);
  });
}
