// Une validation stricte rejette les champs inattendus avant tout accès aux données.
import { z } from "zod";
import { HttpError } from "./http-error.js";

export function parseBody(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new HttpError(400, details.join("; "), "DONNEES_INVALIDES");
  }
  return result.data;
}

export const idSchema = z.string().uuid("identifiant invalide");
export const nomSchema = z.string().trim().min(1).max(120);
export const montantSchema = z.number().int().positive().safe();
