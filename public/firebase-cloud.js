const FIREBASE_VERSION = "11.10.0";
const FIREBASE_BASE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
const LOCAL_CONFIG_KEY = "mirac_erp_cloud_runtime_config_v1";
const COLLECTIONS = [
  "accounts",
  "cariCards",
  "items",
  "recipes",
  "transactions",
  "debtPlans",
  "fixedExpenses",
  "productionJobs",
  "logs"
];
const BACKUP_RUNS_COLLECTION = "backupRuns";
const BACKUP_CHUNKS_COLLECTION = "backupChunks";
const DEFAULT_CLOUD_CONFIG = { orgId: "mirac", autoSyncDelayMs: 1200 };
const MAX_ATOMIC_WRITES = 450;
const DOCUMENT_SCHEMA_VERSION = 2;
const BACKUP_SCHEMA_VERSION = 1;
const BACKUP_CHUNK_CHAR_LIMIT = 400000;
const SDK_LOAD_TIMEOUT_MS = 12000;

export class CloudConflictError extends Error {
  constructor(conflicts) {
    super("Bir veya daha fazla bulut kaydi baska cihazda degisti.");
    this.name = "CloudConflictError";
    this.code = "cloud/conflict";
    this.conflicts = conflicts;
  }
}

function isPlaceholder(value) {
  return !value || /YOUR_|CHANGE_ME|PROJECT_ID/i.test(String(value));
}

function validateConfig(firebaseConfig, cloudConfig) {
  const required = ["apiKey", "authDomain", "projectId", "appId"];
  const missing = required.filter(key => isPlaceholder(firebaseConfig?.[key]));
  if (missing.length) throw new Error(`Eksik Firebase Web ayari: ${missing.join(", ")}`);

  const orgId = String(cloudConfig.orgId || "").trim();
  if (!orgId || orgId.includes("/")) throw new Error("cloudConfig.orgId tek bir gecerli Firestore belge kimligi olmali.");
  return { ...cloudConfig, orgId };
}

function readStoredRuntimeConfig() {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(LOCAL_CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const firebaseConfig = parsed?.firebaseConfig || {};
    const cloudConfig = validateConfig(firebaseConfig, {
      ...DEFAULT_CLOUD_CONFIG,
      ...(parsed?.cloudConfig || {})
    });
    return { firebaseConfig, cloudConfig };
  } catch (error) {
    return { error, reason: "invalid-config" };
  }
}

async function loadLocalConfig() {
  const stored = readStoredRuntimeConfig();
  if (stored) {
    if (stored.error) return stored;
    return stored;
  }
  try {
    const module = await import("./firebase-config.js");
    const cloudConfig = validateConfig(module.firebaseConfig, {
      ...DEFAULT_CLOUD_CONFIG,
      ...(module.cloudConfig || {})
    });
    return { firebaseConfig: module.firebaseConfig, cloudConfig };
  } catch (error) {
    const missingFile = /firebase-config\.js|Failed to fetch dynamically imported module|Importing a module script failed/i.test(error?.message || "");
    return { error, reason: missingFile ? "missing-config" : "invalid-config" };
  }
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function timeoutAfter(ms, message) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

function stableString(value) {
  if (Array.isArray(value)) return `[${value.map(stableString).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableString(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function recordLegacyId(collectionName, record, index) {
  if (record.legacyId) return String(record.legacyId);
  if (record.id) return String(record.id);
  if (record.code) return String(record.code);
  if (collectionName === "accounts" && record.name) return String(record.name);
  if (collectionName === "recipes") return `${record.product || "urun"}::${record.component || "bilesen"}`;
  if (collectionName === "logs") {
    return [record.at, record.event, record.id, record.txId, record.name, index].filter(value => value !== undefined && value !== "").join("::");
  }
  if (record.name) return String(record.name);
  return `${collectionName}-${index}`;
}

function recordDocId(collectionName, legacyId) {
  const encoded = encodeURIComponent(String(legacyId)).replace(/\./g, "%2E");
  return `${collectionName}-${encoded}`.slice(0, 1400);
}

function toCloudRecord(collectionName, record, index) {
  const legacyId = recordLegacyId(collectionName, record, index);
  const data = plain({ ...record, legacyId });
  return {
    docId: recordDocId(collectionName, legacyId),
    legacyId,
    order: index,
    data,
    fingerprint: stableString({ data, order: index })
  };
}

function encodeBusinessData(value) {
  const data = plain(value);
  if (Object.prototype.hasOwnProperty.call(data, "createdAt")) {
    data.recordCreatedAt = data.createdAt;
    delete data.createdAt;
  }
  if (Object.prototype.hasOwnProperty.call(data, "updatedAt")) {
    data.recordUpdatedAt = data.updatedAt;
    delete data.updatedAt;
  }
  return data;
}

function decodeBusinessData(value) {
  const data = plain(value);
  if (Object.prototype.hasOwnProperty.call(data, "recordCreatedAt")) {
    data.createdAt = data.recordCreatedAt;
    delete data.recordCreatedAt;
  }
  if (Object.prototype.hasOwnProperty.call(data, "recordUpdatedAt")) {
    data.updatedAt = data.recordUpdatedAt;
    delete data.recordUpdatedAt;
  }
  return data;
}

function fromCloudDocument(snapshot) {
  const raw = snapshot.data();
  const {
    schemaVersion,
    revision,
    order,
    createdAt,
    createdBy,
    updatedAt,
    updatedBy,
    clientId,
    ...encodedData
  } = raw;
  const data = decodeBusinessData(encodedData);
  return {
    docId: snapshot.id,
    version: Number(revision || 0),
    order: Number(order || 0),
    data,
    fingerprint: stableString({ data, order: Number(order || 0) }),
    createdAt,
    createdBy: createdBy || "",
    updatedAt: updatedAt?.toDate?.()?.toISOString?.() || "",
    updatedBy: updatedBy || "",
    clientId: clientId || ""
  };
}

function emptyState() {
  return Object.fromEntries(COLLECTIONS.map(name => [name, []]));
}

function backupRunId(date = new Date()) {
  return `yedek-${date.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
}

function timestampToIso(value) {
  return value?.toDate?.()?.toISOString?.() || "";
}

function chunkString(value, limit = BACKUP_CHUNK_CHAR_LIMIT) {
  const text = String(value || "");
  const chunks = [];
  for (let index = 0; index < text.length; index += limit) {
    chunks.push(text.slice(index, index + limit));
  }
  return chunks.length ? chunks : [""];
}

export async function createFirebaseCloud() {
  const configResult = await loadLocalConfig();
  if (configResult.error) {
    return { configured: false, reason: configResult.reason, message: configResult.error.message };
  }

  try {
    const [appSdk, authSdk, firestoreSdk] = await Promise.race([
      Promise.all([
        import(`${FIREBASE_BASE_URL}/firebase-app.js`),
        import(`${FIREBASE_BASE_URL}/firebase-auth.js`),
        import(`${FIREBASE_BASE_URL}/firebase-firestore.js`)
      ]),
      timeoutAfter(SDK_LOAD_TIMEOUT_MS, "Firebase bağlantısı zaman aşımına uğradı. İnterneti kontrol edip tekrar dene.")
    ]);

    const appName = `mirac-erp-${configResult.firebaseConfig.projectId}`;
    const existingApp = appSdk.getApps().find(item => item.name === appName);
    const app = existingApp || appSdk.initializeApp(configResult.firebaseConfig, appName);
    const auth = authSdk.getAuth(app);
    let db;
    try {
      db = firestoreSdk.initializeFirestore(app, {
        localCache: firestoreSdk.persistentLocalCache({
          tabManager: firestoreSdk.persistentMultipleTabManager()
        })
      });
    } catch {
      db = firestoreSdk.getFirestore(app);
    }
    const orgId = configResult.cloudConfig.orgId;
    const collectionRefs = Object.fromEntries(COLLECTIONS.map(name => [
      name,
      firestoreSdk.collection(db, "orgs", orgId, name)
    ]));
    const memberRef = user => firestoreSdk.doc(db, "allowedUsers", user.uid);
    const backupRunsRef = firestoreSdk.collection(db, "orgs", orgId, BACKUP_RUNS_COLLECTION);
    const backupChunksRef = firestoreSdk.collection(db, "orgs", orgId, BACKUP_CHUNKS_COLLECTION);
    let baseline = Object.fromEntries(COLLECTIONS.map(name => [name, new Map()]));

    function currentRecords(nextState) {
      return Object.fromEntries(COLLECTIONS.map(name => [
        name,
        new Map((nextState[name] || []).map((record, index) => {
          const normalized = toCloudRecord(name, record, index);
          return [normalized.docId, normalized];
        }))
      ]));
    }

    async function loadState() {
      const snapshots = await Promise.all(COLLECTIONS.map(name => firestoreSdk.getDocs(collectionRefs[name])));
      const nextBaseline = Object.fromEntries(COLLECTIONS.map(name => [name, new Map()]));
      const state = emptyState();
      let documentCount = 0;

      snapshots.forEach((querySnapshot, index) => {
        const name = COLLECTIONS[index];
        const records = querySnapshot.docs.map(fromCloudDocument).sort((a, b) => a.order - b.order);
        for (const record of records) nextBaseline[name].set(record.docId, record);
        state[name] = records.map(record => record.data);
        documentCount += records.length;
      });

      baseline = nextBaseline;
      return { state, documentCount, loadedAt: new Date().toISOString() };
    }

    async function getMemberProfile(user = auth.currentUser) {
      if (!user) return null;
      const snapshot = await firestoreSdk.getDoc(memberRef(user));
      if (!snapshot.exists()) return null;
      const data = snapshot.data();
      return {
        uid: user.uid,
        email: data.email || user.email || "",
        displayName: data.displayName || user.displayName || "",
        role: data.role || "viewer",
        active: data.active === true,
        orgId: data.orgId || orgId
      };
    }

    function collectChanges(nextState) {
      const current = currentRecords(nextState);
      const changes = [];
      for (const name of COLLECTIONS) {
        for (const [docId, record] of current[name]) {
          const previous = baseline[name].get(docId);
          if (!previous || previous.fingerprint !== record.fingerprint) {
            changes.push({ type: previous ? "update" : "create", collectionName: name, docId, record, previous });
          }
        }
        for (const [docId, previous] of baseline[name]) {
          if (!current[name].has(docId)) changes.push({ type: "delete", collectionName: name, docId, previous });
        }
      }
      return changes;
    }

    async function saveState(nextState, clientId) {
      const user = auth.currentUser;
      if (!user) throw new Error("Bulut kaydi icin oturum gerekli.");
      const changes = collectChanges(nextState);
      if (!changes.length) return { changedCount: 0, changes: [] };
      if (changes.length > MAX_ATOMIC_WRITES) {
        throw new Error(`Tek kayitta en fazla ${MAX_ATOMIC_WRITES} belge degistirilebilir. JSON yedegi alip veriyi parcalar halinde aktar.`);
      }

      const result = await firestoreSdk.runTransaction(db, async transaction => {
        const reads = [];
        for (const change of changes) {
          const ref = firestoreSdk.doc(collectionRefs[change.collectionName], change.docId);
          reads.push({ change, ref, snapshot: await transaction.get(ref) });
        }

        const conflicts = [];
        for (const item of reads) {
          const actualVersion = item.snapshot.exists() ? Number(item.snapshot.data().revision || 0) : 0;
          const expectedVersion = Number(item.change.previous?.version || 0);
          const unexpectedCreate = item.change.type === "create" && item.snapshot.exists();
          const missingExisting = item.change.type !== "create" && !item.snapshot.exists();
          if (unexpectedCreate || missingExisting || actualVersion !== expectedVersion) {
            conflicts.push({
              collectionName: item.change.collectionName,
              docId: item.change.docId,
              legacyId: item.change.record?.legacyId || item.change.previous?.data?.legacyId || "",
              expectedVersion,
              actualVersion
            });
          }
        }
        if (conflicts.length) throw new CloudConflictError(conflicts);

        for (const item of reads) {
          const { change, ref } = item;
          if (change.type === "delete") {
            transaction.delete(ref);
            continue;
          }
          const version = Number(change.previous?.version || 0) + 1;
          const existing = item.snapshot.exists() ? item.snapshot.data() : null;
          transaction.set(ref, {
            ...encodeBusinessData(change.record.data),
            schemaVersion: DOCUMENT_SCHEMA_VERSION,
            revision: version,
            createdAt: existing?.createdAt || firestoreSdk.serverTimestamp(),
            createdBy: existing?.createdBy || user.uid,
            updatedAt: firestoreSdk.serverTimestamp(),
            updatedBy: user.uid,
            order: change.record.order,
            clientId
          });
        }
        return reads.map(item => ({
          type: item.change.type,
          collectionName: item.change.collectionName,
          docId: item.change.docId,
          version: item.change.type === "delete" ? 0 : Number(item.change.previous?.version || 0) + 1,
          record: item.change.record
        }));
      });

      for (const change of result) {
        if (change.type === "delete") {
          baseline[change.collectionName].delete(change.docId);
        } else {
          baseline[change.collectionName].set(change.docId, {
            ...change.record,
            version: change.version
          });
        }
      }
      return { changedCount: result.length, changes: result };
    }

    function subscribeState(callback, onError) {
      const unsubscribers = COLLECTIONS.map(name => firestoreSdk.onSnapshot(
        collectionRefs[name],
        snapshot => callback({
          collectionName: name,
          changes: snapshot.docChanges().map(change => ({ type: change.type, docId: change.doc.id }))
        }),
        onError
      ));
      return () => unsubscribers.forEach(unsubscribe => unsubscribe());
    }

    async function saveBackup(nextState, clientId, note = "") {
      const user = auth.currentUser;
      if (!user) throw new Error("Bulut yedegi icin oturum gerekli.");
      const cleanState = plain(nextState);
      const encoder = new TextEncoder();
      const runId = backupRunId();
      const batch = firestoreSdk.writeBatch(db);
      let chunkCount = 0;
      let totalBytes = 0;
      const recordCount = COLLECTIONS.reduce((total, name) => total + (Array.isArray(cleanState[name]) ? cleanState[name].length : 0), 0);

      for (const name of COLLECTIONS) {
        const json = JSON.stringify(cleanState[name] || []);
        const parts = chunkString(json);
        totalBytes += encoder.encode(json).length;
        parts.forEach((part, index) => {
          const docId = `${runId}-${name}-${String(index + 1).padStart(3, "0")}`;
          batch.set(firestoreSdk.doc(backupChunksRef, docId), {
            backupSchemaVersion: BACKUP_SCHEMA_VERSION,
            runId,
            collectionName: name,
            part: index + 1,
            totalParts: parts.length,
            json: part,
            byteLength: encoder.encode(part).length,
            createdAt: firestoreSdk.serverTimestamp(),
            createdBy: user.uid,
            clientId
          });
          chunkCount += 1;
        });
      }

      batch.set(firestoreSdk.doc(backupRunsRef, runId), {
        backupSchemaVersion: BACKUP_SCHEMA_VERSION,
        stateVersion: cleanState.meta?.version || "",
        appVersion: cleanState.meta?.appVersion || "",
        note: String(note || "").slice(0, 240),
        recordCount,
        chunkCount,
        totalBytes,
        createdAt: firestoreSdk.serverTimestamp(),
        createdBy: user.uid,
        clientId
      });
      await batch.commit();
      return { runId, recordCount, chunkCount, totalBytes };
    }

    async function listBackupRuns(maxCount = 5) {
      const user = auth.currentUser;
      if (!user) throw new Error("Bulut yedek listesi icin oturum gerekli.");
      const snapshot = await firestoreSdk.getDocs(
        firestoreSdk.query(
          backupRunsRef,
          firestoreSdk.orderBy("createdAt", "desc"),
          firestoreSdk.limit(Math.max(1, Math.min(Number(maxCount) || 5, 20)))
        )
      );
      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          recordCount: Number(data.recordCount || 0),
          chunkCount: Number(data.chunkCount || 0),
          totalBytes: Number(data.totalBytes || 0),
          note: data.note || "",
          createdAt: timestampToIso(data.createdAt),
          createdBy: data.createdBy || ""
        };
      });
    }

    return {
      configured: true,
      sdkVersion: FIREBASE_VERSION,
      orgId,
      collections: [...COLLECTIONS],
      autoSyncDelayMs: Number(configResult.cloudConfig.autoSyncDelayMs) || DEFAULT_CLOUD_CONFIG.autoSyncDelayMs,
      onAuthChanged: callback => authSdk.onAuthStateChanged(auth, callback),
      async signIn(email, password, remember) {
        await authSdk.setPersistence(auth, remember ? authSdk.browserLocalPersistence : authSdk.browserSessionPersistence);
        return authSdk.signInWithEmailAndPassword(auth, email, password);
      },
      signOut: () => authSdk.signOut(auth),
      getMemberProfile,
      loadState,
      saveState,
      saveBackup,
      listBackupRuns,
      subscribeState
    };
  } catch (error) {
    return { configured: false, reason: "sdk-load-failed", message: error?.message || "Firebase SDK yuklenemedi." };
  }
}
