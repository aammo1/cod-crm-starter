import { z } from "./validation";

export const createAgentSchema = z
  .object({
    name: z
      .string({ required_error: "Le nom est requis." })
      .trim()
      .min(1, "Le nom est requis.")
      .max(120, "Le nom ne doit pas dépasser 120 caractères."),
    email: z
      .string({ required_error: "L'adresse email est requise." })
      .trim()
      .toLowerCase()
      .email("Adresse email invalide.")
      .max(254, "L'email ne doit pas dépasser 254 caractères."),
    password: z
      .string({ required_error: "Le mot de passe est requis." })
      .min(12, "Le mot de passe doit contenir au moins 12 caractères.")
      .max(128, "Le mot de passe ne doit pas dépasser 128 caractères."),
  })
  .strict();

export const updateAgentSchema = z.union([
  z
    .object({
      name: z
        .string({ required_error: "Le nom est requis." })
        .trim()
        .min(1, "Le nom est requis.")
        .max(120, "Le nom ne doit pas dépasser 120 caractères."),
    })
    .strict(),
  z
    .object({
      isActive: z.boolean({ required_error: "Le statut d'activation est requis." }),
    })
    .strict(),
]);

export const resetAgentPasswordSchema = z
  .object({
    password: z
      .string({ required_error: "Le mot de passe est requis." })
      .min(12, "Le mot de passe doit contenir au moins 12 caractères.")
      .max(128, "Le mot de passe ne doit pas dépasser 128 caractères."),
  })
  .strict();

export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
export type ResetAgentPasswordInput = z.infer<typeof resetAgentPasswordSchema>;
