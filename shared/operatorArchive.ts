/** Archive snapshots are immutable; IDs and their texts must never be reused. */
export type ArchiveReply = 'careful' | 'focused';
export interface ArchiveContent {
  title: string;
  text: string;
  sender?: string;
  season?: number;
  sourceMission?: string;
  carefulReply?: string;
  focusedReply?: string;
}
export interface ArchiveEntry {
  entry_key: string;
  category: 'story' | 'city';
  position: number;
  content: ArchiveContent;
  unlocked_at: string;
  read_at: string | null;
  reply: ArchiveReply | null;
}
export interface ArchiveResponse { ok: true; entries: ArchiveEntry[]; caseAvailable?: boolean; caseAttempted?: boolean }
