/*
 * Emulator tests for the knowledge system: Firestore + Storage rules (via
 * @firebase/rules-unit-testing) and the ingestion + activity Cloud Functions
 * (via the Admin SDK against the Functions emulator).
 *
 * Run: npm run test:rules   (needs JDK 21 + firebase-tools; see package.json).
 */

// Point the Admin SDK at the emulators before importing it.
process.env.GCLOUD_PROJECT ||= "micah-amari-angie-os";
process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= "127.0.0.1:9199";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, getDocs, collection } from "firebase/firestore";
import { ref, uploadBytes, getBytes } from "firebase/storage";
import { initializeApp as adminInit } from "firebase-admin/app";
import { getFirestore as getAdminFs } from "firebase-admin/firestore";
import { getStorage as getAdminStorage } from "firebase-admin/storage";

const PROJECT = "micah-amari-angie-os";
const ROOT = "/Users/greenwood/6A7_Development/AngieOS";
// Must match the default bucket the ingestion function reads (getStorage().bucket()).
const BUCKET = `${PROJECT}.firebasestorage.app`;

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT,
  firestore: {
    rules: readFileSync(`${ROOT}/firestore.rules`, "utf8"),
    host: "127.0.0.1",
    port: 8080,
  },
  storage: {
    rules: readFileSync(`${ROOT}/storage.rules`, "utf8"),
    host: "127.0.0.1",
    port: 9199,
  },
});

const adminApp = adminInit({ projectId: PROJECT, storageBucket: BUCKET });
const adminDb = getAdminFs(adminApp);
const adminBucket = getAdminStorage(adminApp).bucket();

// Auth contexts.
const ctx = (email) =>
  testEnv.authenticatedContext(email.replace(/[^a-z0-9]/gi, ""), {
    email,
    email_verified: true,
  });
const admin = ctx("admin@x.com"); // knowledgeRead/Write/Approve
const writer = ctx("writer@x.com"); // knowledgeRead/Write
const reader = ctx("reader@x.com"); // knowledgeRead only
const noperm = ctx("noperm@x.com"); // active, no permissions
const inactive = ctx("inactive@x.com"); // has perms but active:false
const anon = testEnv.unauthenticatedContext();

const fs = (c) => c.firestore();
const st = (c) => c.storage();

function source(slug, o = {}) {
  return {
    title: "T",
    slug,
    description: "",
    category: "company",
    subcategory: "policies",
    documentType: "policy",
    storagePath: `knowledge/company/policies/${slug}.txt`,
    mimeType: "text/plain",
    status: "draft",
    version: 1,
    sourceVersion: 1,
    isAuthoritative: false,
    allowedAgents: [],
    tags: [],
    industries: [],
    relatedSources: [],
    priority: 0,
    confidence: null,
    domain: "company",
    importance: "reference",
    processingStatus: "pending",
    createdBy: "writer@x.com",
    updatedBy: "writer@x.com",
    owner: "writer@x.com",
    ...o,
  };
}

function research(slug, o = {}) {
  return {
    title: "R",
    slug,
    summary: "s",
    findings: "f",
    sources: [],
    industry: "hvac",
    geography: "US",
    researchType: "market",
    confidence: 0.5,
    status: "draft",
    expiresAt: null,
    createdBy: "writer@x.com",
    updatedBy: "writer@x.com",
    ...o,
  };
}

// Seed baseline data with rules disabled (the Admin-SDK path).
await testEnv.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  const perms = (p) => ({ permissions: p });
  await setDoc(doc(db, "users", "admin@x.com"), {
    email: "admin@x.com",
    active: true,
    role: "admin",
    ...perms({ knowledgeRead: true, knowledgeWrite: true, knowledgeApprove: true }),
  });
  await setDoc(doc(db, "users", "writer@x.com"), {
    email: "writer@x.com",
    active: true,
    role: "staff",
    ...perms({ knowledgeRead: true, knowledgeWrite: true }),
  });
  await setDoc(doc(db, "users", "reader@x.com"), {
    email: "reader@x.com",
    active: true,
    role: "staff",
    ...perms({ knowledgeRead: true }),
  });
  await setDoc(doc(db, "users", "noperm@x.com"), {
    email: "noperm@x.com",
    active: true,
    role: "staff",
    ...perms({}),
  });
  await setDoc(doc(db, "users", "inactive@x.com"), {
    email: "inactive@x.com",
    active: false,
    role: "staff",
    ...perms({ knowledgeRead: true, knowledgeWrite: true, knowledgeApprove: true }),
  });

  await setDoc(doc(db, "knowledgeSources", "active-doc"), source("active-doc", { status: "active", processingStatus: "ready" }));
  await setDoc(doc(db, "knowledgeSources", "draft-doc"), source("draft-doc"));
  await setDoc(doc(db, "knowledgeContent", "active-doc"), { sourceSlug: "active-doc", sourceVersion: 1, rawText: "hi", charCount: 2 });
  await setDoc(doc(db, "researchReports", "rr-1"), research("rr-1", { status: "active" }));
  await setDoc(doc(db, "knowledgeCollections", "col-1"), { collectionId: "col-1", name: "C", slug: "c", description: "", parentId: null });
  await setDoc(doc(db, "activities", "seed-act"), { type: "knowledge_source", action: "created" });

  await uploadBytes(ref(c.storage(), "knowledge/company/policies/handbook.txt"), new Uint8Array([1, 2, 3]));
});

// ---------------- Rules matrix ----------------

test("authorized read of an active source", async () => {
  await assertSucceeds(getDoc(doc(fs(reader), "knowledgeSources", "active-doc")));
});
test("unauthorized read (no knowledgeRead) of active source is denied", async () => {
  await assertFails(getDoc(doc(fs(noperm), "knowledgeSources", "active-doc")));
});
test("anon read is denied", async () => {
  await assertFails(getDoc(doc(fs(anon), "knowledgeSources", "active-doc")));
});
test("draft visibility: reader denied, writer allowed", async () => {
  await assertFails(getDoc(doc(fs(reader), "knowledgeSources", "draft-doc")));
  await assertSucceeds(getDoc(doc(fs(writer), "knowledgeSources", "draft-doc")));
});
test("create draft needs knowledgeWrite", async () => {
  await assertSucceeds(setDoc(doc(fs(writer), "knowledgeSources", "w-new"), source("w-new")));
  await assertFails(setDoc(doc(fs(reader), "knowledgeSources", "r-new"), source("r-new", { createdBy: "reader@x.com", updatedBy: "reader@x.com", owner: "reader@x.com" })));
});
test("cannot forge createdBy to another user (privilege escalation)", async () => {
  await assertFails(setDoc(doc(fs(writer), "knowledgeSources", "forge"), source("forge", { createdBy: "admin@x.com" })));
});
test("cannot create with processingStatus other than pending", async () => {
  await assertFails(setDoc(doc(fs(writer), "knowledgeSources", "notpending"), source("notpending", { processingStatus: "ready" })));
});
test("activate needs knowledgeApprove (writer denied, admin allowed)", async () => {
  await assertFails(updateDoc(doc(fs(writer), "knowledgeSources", "draft-doc"), { status: "active", updatedBy: "writer@x.com" }));
  await assertSucceeds(updateDoc(doc(fs(admin), "knowledgeSources", "draft-doc"), { status: "active", updatedBy: "admin@x.com" }));
});
test("archive needs knowledgeApprove", async () => {
  await assertSucceeds(updateDoc(doc(fs(admin), "knowledgeSources", "active-doc"), { status: "archived", updatedBy: "admin@x.com" }));
});
test("clients cannot force processingStatus to processing/ready; may requeue to pending", async () => {
  await assertFails(updateDoc(doc(fs(writer), "knowledgeSources", "w-new"), { processingStatus: "ready", updatedBy: "writer@x.com" }));
  await assertFails(updateDoc(doc(fs(writer), "knowledgeSources", "w-new"), { processingStatus: "processing", updatedBy: "writer@x.com" }));
  await assertSucceeds(updateDoc(doc(fs(writer), "knowledgeSources", "w-new"), { processingStatus: "pending", sourceVersion: 2, updatedBy: "writer@x.com" }));
});
test("inactive user denied everywhere", async () => {
  await assertFails(getDoc(doc(fs(inactive), "knowledgeSources", "active-doc")));
  await assertFails(setDoc(doc(fs(inactive), "knowledgeSources", "inact"), source("inact", { createdBy: "inactive@x.com", updatedBy: "inactive@x.com", owner: "inactive@x.com" })));
});
test("knowledgeContent: reader reads, client write denied", async () => {
  await assertSucceeds(getDoc(doc(fs(reader), "knowledgeContent", "active-doc")));
  await assertFails(getDoc(doc(fs(noperm), "knowledgeContent", "active-doc")));
  await assertFails(setDoc(doc(fs(admin), "knowledgeContent", "active-doc"), { rawText: "tampered" }));
});
test("researchReports: reader reads, writer writes, reader cannot write", async () => {
  await assertSucceeds(getDoc(doc(fs(reader), "researchReports", "rr-1")));
  await assertSucceeds(setDoc(doc(fs(writer), "researchReports", "rr-w"), research("rr-w")));
  await assertFails(setDoc(doc(fs(reader), "researchReports", "rr-r"), research("rr-r", { createdBy: "reader@x.com", updatedBy: "reader@x.com" })));
});
test("knowledgeCollections: any active reads, only knowledgeApprove writes", async () => {
  await assertSucceeds(getDoc(doc(fs(noperm), "knowledgeCollections", "col-1")));
  await assertFails(setDoc(doc(fs(writer), "knowledgeCollections", "col-w"), { collectionId: "col-w", name: "N", slug: "n", parentId: null }));
  await assertSucceeds(setDoc(doc(fs(admin), "knowledgeCollections", "col-a"), { collectionId: "col-a", name: "N", slug: "n", parentId: null }));
});
test("users self-write denied (privilege escalation)", async () => {
  await assertFails(setDoc(doc(fs(reader), "users", "reader@x.com"), { active: true, permissions: { knowledgeApprove: true } }));
});
test("activities: active reads, client write denied", async () => {
  await assertSucceeds(getDoc(doc(fs(reader), "activities", "seed-act")));
  await assertFails(setDoc(doc(fs(admin), "activities", "forge"), { action: "x" }));
});
test("storage: writer uploads knowledge, reader denied upload, reader reads, noperm denied read", async () => {
  await assertSucceeds(uploadBytes(ref(st(writer), "knowledge/company/policies/up.txt"), new Uint8Array([9])));
  await assertFails(uploadBytes(ref(st(reader), "knowledge/company/policies/up2.txt"), new Uint8Array([9])));
  await assertSucceeds(getBytes(ref(st(reader), "knowledge/company/policies/handbook.txt")));
  await assertFails(getBytes(ref(st(noperm), "knowledge/company/policies/handbook.txt")));
});

// ---------------- Ingestion + activity (Admin SDK + Functions emulator) ----------------

async function waitFor(fn, { timeout = 20000, interval = 400 } = {}) {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, interval));
  }
}

async function adminSource(slug, o = {}) {
  await adminDb.collection("knowledgeSources").doc(slug).set(source(slug, o));
}

test("ingestion: supported TXT extracts text, source becomes ready, content stored", async () => {
  const slug = "ing-txt";
  await adminBucket.file(`knowledge/company/policies/${slug}.txt`).save("hello leads");
  await adminSource(slug);

  const src = await waitFor(async () => {
    const s = await adminDb.collection("knowledgeSources").doc(slug).get();
    const d = s.data();
    return d && d.processingStatus !== "pending" && d.processingStatus !== "processing" ? d : null;
  });
  assert.equal(src.processingStatus, "ready");
  assert.equal(src.processedVersion, 1);

  const content = (await adminDb.collection("knowledgeContent").doc(slug).get()).data();
  assert.ok(content, "knowledgeContent should exist");
  assert.equal(content.rawText, "hello leads");
  assert.equal(content.sourceVersion, 1);
});

test("ingestion: unsupported PDF becomes failed (never ready), source preserved, no content", async () => {
  const slug = "ing-pdf";
  await adminBucket.file(`knowledge/company/policies/${slug}.pdf`).save("%PDF-1.4 fake");
  await adminSource(slug, {
    storagePath: `knowledge/company/policies/${slug}.pdf`,
    mimeType: "application/pdf",
  });

  const src = await waitFor(async () => {
    const s = await adminDb.collection("knowledgeSources").doc(slug).get();
    const d = s.data();
    return d && d.processingStatus === "failed" ? d : null;
  });
  assert.equal(src.processingStatus, "failed");
  assert.match(src.processingError, /not supported/i);
  assert.equal(src.title, "T", "source record is preserved");

  const content = await adminDb.collection("knowledgeContent").doc(slug).get();
  assert.equal(content.exists, false, "no content for unsupported file");
});

test("reprocessing: version change replaces stale content, retries stay single-doc", async () => {
  const slug = "ing-txt";
  // New file content + queue a new version.
  await adminBucket.file(`knowledge/company/policies/${slug}.txt`).save("updated leads v2");
  await adminDb.collection("knowledgeSources").doc(slug).update({ sourceVersion: 2, processingStatus: "pending" });

  const content = await waitFor(async () => {
    const c = await adminDb.collection("knowledgeContent").doc(slug).get();
    const d = c.data();
    return d && d.sourceVersion === 2 ? d : null;
  });
  assert.equal(content.rawText, "updated leads v2", "stale content replaced");

  const src = (await adminDb.collection("knowledgeSources").doc(slug).get()).data();
  assert.equal(src.processedVersion, 2);
  assert.equal(src.processingStatus, "ready");

  // Exactly one content doc for the slug (no duplication on reprocess).
  const all = await adminDb.collection("knowledgeContent").where("sourceSlug", "==", slug).get();
  assert.equal(all.size, 1);
});

test("activity log: created logged once, processing flips add none, activate logs activated", async () => {
  const slug = "act-doc";
  await adminBucket.file(`knowledge/company/policies/${slug}.txt`).save("activity body");
  await adminSource(slug);

  // Wait until fully processed — this involves several function status flips
  // (pending -> processing -> ready) that must NOT create activity entries.
  await waitFor(async () => {
    const d = (await adminDb.collection("knowledgeSources").doc(slug).get()).data();
    return d && d.processingStatus === "ready" ? d : null;
  });

  const created = await waitFor(async () => {
    const q = await adminDb.collection("activities").where("documentId", "==", slug).get();
    return q.size >= 1 ? q : null;
  });
  assert.deepEqual(
    created.docs.map((d) => d.data().action).sort(),
    ["created"],
    "only 'created' — the ingestion status flips add no activity",
  );

  // Activate (Admin SDK bypasses rules) -> exactly one more 'activated' entry.
  await adminDb.collection("knowledgeSources").doc(slug).update({ status: "active", updatedBy: "admin@x.com" });
  await waitFor(async () => {
    const q = await adminDb.collection("activities").where("documentId", "==", slug).get();
    return q.docs.some((d) => d.data().action === "activated") ? q : null;
  });
  const finalActs = await adminDb.collection("activities").where("documentId", "==", slug).get();
  assert.deepEqual(finalActs.docs.map((d) => d.data().action).sort(), ["activated", "created"]);
});

test.after(async () => {
  await testEnv.cleanup();
});
