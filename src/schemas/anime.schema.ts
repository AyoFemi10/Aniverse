import { z } from 'zod';

export const AnimeParamsSchema = z.object({
  id: z
    .string({ required_error: 'Anime ID is required' })
    .min(1)
    .max(300)
    .regex(/^[a-z0-9-]+$/i, 'Invalid anime ID format'),
});

export type AnimeParams = z.infer<typeof AnimeParamsSchema>;

export const EpisodeParamsSchema = AnimeParamsSchema.extend({
  episode: z.coerce
    .number({ required_error: 'Episode number is required' })
    .int()
    .min(1)
    .max(10_000),
});

export type EpisodeParams = z.infer<typeof EpisodeParamsSchema>;

export const AnimeDetailsSchema = z.object({
  title: z.string(),
  description: z.string(),
  aliases: z.string(),
  aired: z.string(),
  image: z.string().optional(),
  genres: z.array(z.string()).optional(),
  status: z.string().optional(),
  rating: z.string().optional(),
});

export const EpisodeItemSchema = z.object({
  number: z.number().int().positive(),
  url: z.string().url(),
});

export const AnimeDetailsResponseSchema = z.object({
  success: z.literal(true),
  anime: AnimeDetailsSchema,
  cached: z.boolean(),
});

export const EpisodesResponseSchema = z.object({
  success: z.literal(true),
  episodes: z.array(EpisodeItemSchema),
  total: z.number().int().nonnegative(),
  cached: z.boolean(),
});
