/**
 * @groweasy/shared
 *
 * Single source of truth shared by the frontend and backend:
 *   - API request/response contracts (DTOs)
 *   - the GrowEasy CRM Zod schema + inferred types (lands in Milestone 8)
 *
 * Keeping these here guarantees the client and server never drift.
 */

export const APP_NAME = "GrowEasy Importer" as const;

export * from "./api-contracts";
export * from "./crm";
