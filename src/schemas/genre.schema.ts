import { z } from 'zod';

export const GenreParamsSchema = z.object({
  genre: z
    .string({ required_error: 'Genre slug is required' })
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/i, 'Invalid genre slug – use lowercase letters, numbers and hyphens'),
});

export const GenreQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
});

export type GenreParams = z.infer<typeof GenreParamsSchema>;
export type GenreQuery = z.infer<typeof GenreQuerySchema>;

export const GenreItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
});

export const GenreListResponseSchema = z.object({
  success: z.literal(true),
  genres: z.array(GenreItemSchema),
  total: z.number().int().nonnegative(),
  cached: z.boolean(),
});

export const GenreAnimeResponseSchema = z.object({
  success: z.literal(true),
  genre: z.string(),
  page: z.number().int(),
  hasNextPage: z.boolean(),
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      image: z.string(),
      url: z.string().url(),
      episodes: z.number().int().optional(),
      type: z.string().optional(),
    }),
  ),
  cached: z.boolean(),
});

export const InfoResponseSchema = z.object({
  success: z.literal(true),
  info: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    aliases: z.string(),
    aired: z.string(),
    image: z.string(),
    genres: z.array(z.string()),
    status: z.string(),
    rating: z.string(),
    totalEpisodes: z.number().int().nonnegative(),
    episodes: z.array(
      z.object({
        number: z.number().int().positive(),
        url: z.string().url(),
      }),
    ),
  }),
  cached: z.boolean(),
});
