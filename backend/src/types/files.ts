/** An uploaded file tracked by the FileStorage service. */
export interface StoredFile {
  id: string;
  /** Absolute path on disk. */
  path: string;
  originalName: string;
  sizeBytes: number;
  uploadedAt: Date;
  /** After this instant the file is swept and the id becomes invalid. */
  expiresAt: Date;
}

export interface RegisterFileInput {
  id: string;
  path: string;
  originalName: string;
  sizeBytes: number;
}
