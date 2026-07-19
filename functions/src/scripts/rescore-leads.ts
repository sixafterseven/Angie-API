/*
 * Batch lead scoring / rescoring for the Micah Amari Lead Qualification Engine.
 *
 * Loads every lead, builds an identifier index for cross-record duplicate and
 * conflict detection, scores each with the pure scoreLead(), and writes the
 * additive derived fields (merge — raw fields untouched). Dry-run by default;
 * only writes with --execute.
 *
 * This is also the rescore-on-config-change path: bump SCORING_VERSION (or edit
 * the config), rebuild, and re-run with --execute.
 */

import {getApps, initializeApp} from 'firebase-admin/app';
import {FieldValue, getFirestore} from 'firebase-admin/firestore';

import {DEFAULT_SCORING_CONFIG} from '../lead-scoring/config';
import {scoreLead, toLeadScoreFields} from '../lead-scoring/score';
import {LeadInput, ScoreContext} from '../lead-scoring/types';

const EXECUTE_FLAG = '--execute';
const LEADS_COLLECTION = 'leads';

function getAdminApp() {
  const existing = getApps();

  return existing.length ? existing[0] : initializeApp();
}

interface LoadedLead {
  id: string;
  data: LeadInput;
}

/** Normalizes an identifier for indexing. */
function idKey(value?: string): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Builds cross-record hints: which leads look like duplicates (same Google
 * identifier) and which identifiers map to conflicting business names.
 *
 * @param {LoadedLead[]} leads All loaded leads.
 * @return {Map<string, ScoreContext>} leadId -> batch hints.
 */
function buildContext(leads: LoadedLead[]): Map<string, ScoreContext> {
  const byIdentifier = new Map<string, LoadedLead[]>();

  for (const lead of leads) {
    for (const id of [lead.data.placeId, lead.data.googleId, lead.data.cid]) {
      const key = idKey(id);
      if (!key) {
        continue;
      }
      const group = byIdentifier.get(key) ?? [];
      group.push(lead);
      byIdentifier.set(key, group);
    }
  }

  const context = new Map<string, ScoreContext>();

  for (const group of byIdentifier.values()) {
    if (group.length < 2) {
      continue;
    }

    // Deterministic winner: lowest leadId is the "original".
    const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id));
    const original = sorted[0];

    const names = new Set(
        group.map((l) => (l.data.businessName ?? '').trim().toLowerCase()),
    );
    const conflict = names.size > 1;

    for (const lead of sorted) {
      const existing = context.get(lead.id) ?? {};
      context.set(lead.id, {
        duplicateOf: lead.id === original.id ? existing.duplicateOf ?? null : original.id,
        identifierConflict: existing.identifierConflict || conflict,
      });
    }
  }

  return context;
}

async function loadAllLeads(): Promise<LoadedLead[]> {
  const db = getFirestore(getAdminApp());

  const snapshot = await db.collection(LEADS_COLLECTION).get();

  return snapshot.docs.map((doc) => ({id: doc.id, data: doc.data() as LeadInput}));
}

async function main(): Promise<void> {
  const execute = process.argv.slice(2).includes(EXECUTE_FLAG);

  console.log('Angie OS — batch lead scoring');
  console.log('=============================');
  console.log(`Scoring version: ${DEFAULT_SCORING_CONFIG.version}`);
  console.log(
      execute ?
        'MODE: EXECUTE — derived score fields WILL be written.' :
        'MODE: DRY RUN — no documents will be written.',
  );
  console.log('');

  const leads = await loadAllLeads();
  const context = buildContext(leads);

  const bandCounts: Record<string, number> = {};
  const geoCounts: Record<string, number> = {};

  const db = getFirestore(getAdminApp());
  let batch = db.batch();
  let pending = 0;
  let written = 0;

  for (const lead of leads) {
    const result = scoreLead(lead.data, DEFAULT_SCORING_CONFIG, context.get(lead.id) ?? {});

    bandCounts[result.qualificationBand] = (bandCounts[result.qualificationBand] ?? 0) + 1;

    const geoKey = `${result.geographyStatus}${result.marketTier ? ` (${result.marketTier})` : ''}`;
    geoCounts[geoKey] = (geoCounts[geoKey] ?? 0) + 1;

    if (!execute) {
      continue;
    }

    batch.set(
        db.collection(LEADS_COLLECTION).doc(lead.id),
        {...toLeadScoreFields(result), scoredAt: FieldValue.serverTimestamp()},
        {merge: true},
    );
    pending += 1;

    // Firestore batches cap at 500 ops; commit in chunks.
    if (pending >= 400) {
      await batch.commit();
      written += pending;
      batch = db.batch();
      pending = 0;
    }
  }

  if (execute && pending > 0) {
    await batch.commit();
    written += pending;
  }

  console.log(`Leads found: ${leads.length}`);
  console.log('Band distribution:');
  for (const [band, count] of Object.entries(bandCounts).sort()) {
    console.log(`  ${band.padEnd(16)} ${count}`);
  }
  console.log('Geography distribution:');
  for (const [geo, count] of Object.entries(geoCounts).sort()) {
    console.log(`  ${geo.padEnd(36)} ${count}`);
  }
  console.log('');

  if (!execute) {
    console.log('Dry run complete. No documents were written.');
    console.log(`Re-run with ${EXECUTE_FLAG} to write the scores above.`);
    return;
  }

  console.log(`Done. Wrote scores to ${written} lead document(s).`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
}

/*
 * How to run (from functions/):
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   export GOOGLE_CLOUD_PROJECT=micah-amari-angie-os
 *   npm run build
 *   node lib/scripts/rescore-leads.js            # dry run — prints band distribution
 *   node lib/scripts/rescore-leads.js --execute  # writes derived score fields
 */
