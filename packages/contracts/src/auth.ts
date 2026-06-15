import { z } from 'zod'

export const emailSchema = z.string().trim().toLowerCase().email().max(254)

export const profileSchema = z.object({
  id: z.string().uuid(),
  email: emailSchema,
  displayName: z.string().nullable(),
  createdAt: z.string().datetime(),
})

export type Profile = z.infer<typeof profileSchema>
