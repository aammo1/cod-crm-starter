import { z } from "zod";

// One browser/server vocabulary for inherited default validation messages.
// Explicit schema messages keep precedence (including precise custom refinements).
z.setErrorMap((issue) => {
  switch (issue.code) {
    case "invalid_type": return { message: issue.received === "undefined" ? "Champ requis." : "Type de donnée invalide." };
    case "too_small": return { message: "Valeur trop courte ou inférieure au minimum autorisé." };
    case "too_big": return { message: "Valeur trop longue ou supérieure au maximum autorisé." };
    case "unrecognized_keys": return { message: "Champ non autorisé." };
    default: return { message: "Valeur invalide. Vérifiez les champs." };
  }
});

export { z, ZodError } from "zod";
