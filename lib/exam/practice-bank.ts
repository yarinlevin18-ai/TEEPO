// Practice bank: read/write practice JSON in Drive at לימודים/<course>/exam_prep/practice_bank.json
// Spec §3.3.4. Drive operations stubbed; real impl injects a Drive client.

import type { PracticeSession } from "@/types";

export interface PracticeBankFile {
  version: 1;
  course_id: string;
  updated_at: string;
  sessions: PracticeSession[];
}

export interface DriveClient {
  readJson<T>(path: string): Promise<T | null>;
  writeJson<T>(path: string, data: T): Promise<void>;
}

export function bankPath(courseId: string): string {
  return `לימודים/${courseId}/exam_prep/practice_bank.json`;
}

export async function loadBank(drive: DriveClient, courseId: string): Promise<PracticeBankFile> {
  const existing = await drive.readJson<PracticeBankFile>(bankPath(courseId));
  if (existing && existing.version === 1) return existing;
  return { version: 1, course_id: courseId, updated_at: new Date().toISOString(), sessions: [] };
}

export async function appendSession(
  drive: DriveClient,
  courseId: string,
  session: PracticeSession,
): Promise<void> {
  const bank = await loadBank(drive, courseId);
  bank.sessions.push(session);
  bank.updated_at = new Date().toISOString();
  await drive.writeJson(bankPath(courseId), bank);
}

export async function findSession(
  drive: DriveClient,
  courseId: string,
  sessionId: string,
): Promise<PracticeSession | null> {
  const bank = await loadBank(drive, courseId);
  return bank.sessions.find((s) => s.id === sessionId) ?? null;
}
