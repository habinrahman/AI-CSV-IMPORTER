export interface ImportStep {
  path: string;
  label: string;
  description: string;
}

/** The import journey, in order. The stepper and layout derive from this. */
export const IMPORT_STEPS: ImportStep[] = [
  { path: "/import/upload", label: "Upload", description: "Choose a CSV file" },
  { path: "/import/preview", label: "Preview", description: "Check the data" },
  { path: "/import/progress", label: "Import", description: "AI mapping runs" },
  { path: "/import/result", label: "Result", description: "Review & export" },
];
