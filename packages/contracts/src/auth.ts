import { z } from "zod";

const EMAIL_MAX_LENGTH = 320;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

export const authenticatedUserSchema = z
  .object({
    id: z.string().min(1),
    email: z.string().email(),
    displayName: z.string().min(1),
  })
  .strict();

export const loginRequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(EMAIL_MAX_LENGTH),
    password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  })
  .strict();

const authenticatedSessionSchema = z
  .object({
    status: z.literal("authenticated"),
    user: authenticatedUserSchema,
  })
  .strict();

const unauthenticatedSessionSchema = z
  .object({
    status: z.literal("unauthenticated"),
  })
  .strict();

export const sessionResponseSchema = z.discriminatedUnion("status", [
  authenticatedSessionSchema,
  unauthenticatedSessionSchema,
]);

export const authErrorResponseSchema = z
  .object({
    error: z.string().min(1),
  })
  .strict();

export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type AuthStatus = SessionResponse["status"];
export type AuthErrorResponse = z.infer<typeof authErrorResponseSchema>;
