export type DocumentSnapshotActionType = 'create' | 'auto' | 'named' | 'restore';

export interface DocumentVersionListItem {
  version: number;
  snapshotType: string;
  actionType: DocumentSnapshotActionType | null;
  label: string | null;
  parentVersion: number | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: number;
}

export interface DocumentVersionDetail extends DocumentVersionListItem {
  snapshotData: unknown | null;
  contentHash: string | null;
}
