"use client";

import { ChangeEvent, useState } from "react";
import Link from "next/link";
import { doc, getDoc } from "firebase/firestore";
import { ref, uploadBytesResumable } from "firebase/storage";
import { CheckCircle2, FileSpreadsheet, X } from "lucide-react";

import AppShell from "@/components/app-shell";
import AudreyPlant, { AudreyPhase } from "@/components/audrey-plant";
import { auth, db, storage } from "@/lib/firebase";

type UploadState = "idle" | "checking" | "uploading" | "complete" | "error";

/**
 * Maps the upload state to what Audrey II should be doing.
 */
function audreyPhase(uploadState: UploadState, hasFile: boolean): AudreyPhase {
  if (uploadState === "complete") {
    return "fed";
  }

  if (uploadState === "checking" || uploadState === "uploading") {
    return "eating";
  }

  return hasFile ? "ready" : "idle";
}

/**
 * Formats a date as YYYYMMDD.
 */
function formatBatchDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}

/**
 * Produces a three-digit sequence candidate.
 */
function createSequenceCandidate(): string {
  const bytes = new Uint16Array(1);
  crypto.getRandomValues(bytes);

  return String(bytes[0] % 1000).padStart(3, "0");
}

/**
 * Creates a Batch ID that is not already in Firestore.
 */
async function createAvailableBatchId(): Promise<string> {
  const datePart = formatBatchDate(new Date());

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const sequence = createSequenceCandidate();
    const batchId = `BAT-${datePart}-${sequence}`;

    const existingBatch = await getDoc(doc(db, "batches", batchId));

    if (!existingBatch.exists()) {
      return batchId;
    }
  }

  throw new Error("Could not reserve a unique Batch ID. Please try again.");
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [batchId, setBatchId] = useState("");
  const [error, setError] = useState("");

  function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null;

    setError("");
    setProgress(0);
    setBatchId("");
    setUploadState("idle");

    if (!selectedFile) {
      setFile(null);
      return;
    }

    const extension = selectedFile.name.split(".").pop()?.toLowerCase();

    if (extension !== "xlsx") {
      setFile(null);
      setError("Calvin currently accepts XLSX workbooks only.");
      event.target.value = "";
      return;
    }

    setFile(selectedFile);
  }

  function clearFile() {
    setFile(null);
    setError("");
    setProgress(0);
    setBatchId("");
    setUploadState("idle");
  }

  async function handleUpload() {
    if (!file) {
      setError("Choose an XLSX workbook first.");
      return;
    }

    const currentUser = auth.currentUser;

    if (!currentUser) {
      setError("Your session expired. Sign in again.");
      return;
    }

    setError("");
    setProgress(0);
    setUploadState("checking");

    try {
      const newBatchId = await createAvailableBatchId();

      setBatchId(newBatchId);
      setUploadState("uploading");

      const cleanFilename = file.name.replace(/[^A-Za-z0-9._-]/g, "_");

      const storagePath = `raw/${newBatchId}/${cleanFilename}`;

      const storageReference = ref(storage, storagePath);

      const uploadTask = uploadBytesResumable(storageReference, file, {
        contentType:
          "application/vnd.openxmlformats-officedocument." +
          "spreadsheetml.sheet",
        customMetadata: {
          batchId: newBatchId,
          uploadedByUid: currentUser.uid,
          uploadedByEmail: currentUser.email ?? "",
          originalFilename: file.name,
        },
      });

      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const percentage = Math.round(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100,
          );

          setProgress(percentage);
        },
        (uploadError) => {
          setUploadState("error");
          setError(
            uploadError.message || "The workbook could not be uploaded.",
          );
        },
        () => {
          setProgress(100);
          setUploadState("complete");
        },
      );
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "The upload could not be started.";

      setUploadState("error");
      setError(message);
    }
  }

  const isBusy = uploadState === "checking" || uploadState === "uploading";

  return (
    <AppShell
      title="Upload Leads"
      description="Upload a workbook and send it through Clara, Calvin, and Vera."
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {/* Audrey II arcade panel owns the file picker — chomp UPLOAD to feed her. */}
          <AudreyPlant
            phase={audreyPhase(uploadState, Boolean(file))}
            onSelectFile={handleFileSelection}
            disabled={isBusy}
          />

          <p className="mx-auto mt-4 max-w-lg text-center text-sm leading-6 text-slate-500">
            Upload the original Outscraper or lead-export workbook. Angie OS
            preserves the source file and creates a separate cleaned version.
          </p>

          {file ? (
            <div className="mt-5 flex items-center gap-4 rounded-xl border border-slate-200 p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <FileSpreadsheet size={22} />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{file.name}</p>

                <p className="mt-1 text-xs text-slate-500">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>

              {!isBusy && uploadState !== "complete" ? (
                <button
                  type="button"
                  onClick={clearFile}
                  aria-label="Remove selected file"
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <X size={19} />
                </button>
              ) : null}
            </div>
          ) : null}

          {uploadState === "uploading" ? (
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">Uploading workbook</span>
                <span className="text-slate-500">{progress}%</span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-slate-950 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : null}

          {uploadState === "complete" ? (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex gap-3">
                <CheckCircle2 className="shrink-0 text-emerald-700" size={22} />

                <div>
                  <p className="font-semibold text-emerald-950">
                    Workbook uploaded
                  </p>

                  <p className="mt-1 text-sm text-emerald-800">
                    Batch {batchId} has entered the pipeline. Clara should begin
                    processing automatically.
                  </p>

                  <Link
                    href="/batches"
                    className="mt-3 inline-block text-sm font-semibold text-emerald-950 underline underline-offset-4"
                  >
                    View batch status
                  </Link>
                </div>
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || isBusy || uploadState === "complete"}
            className="mt-6 w-full rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {uploadState === "checking"
              ? "Preparing batch..."
              : uploadState === "uploading"
                ? `Uploading ${progress}%`
                : uploadState === "complete"
                  ? "Upload complete"
                  : "Start lead processing"}
          </button>
        </section>

        <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-semibold">What happens next</h3>

          <ol className="mt-5 space-y-5">
            {[
              [
                "1",
                "Clara registers the batch",
                "Confirms the upload and creates the cleaning job.",
              ],
              [
                "2",
                "Calvin cleans the workbook",
                "Preserves raw data, normalizes fields, and flags issues.",
              ],
              [
                "3",
                "Vera validates the leads",
                "Publishes usable records to the sales-ready database.",
              ],
              [
                "4",
                "Angie makes them useful",
                "Employees can search, prioritize, and create outreach.",
              ],
            ].map(([number, heading, copy]) => (
              <li key={number} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-bold text-white">
                  {number}
                </span>

                <div>
                  <p className="text-sm font-semibold">{heading}</p>
                  <p className="mt-1 text-sm leading-5 text-slate-500">
                    {copy}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </AppShell>
  );
}
