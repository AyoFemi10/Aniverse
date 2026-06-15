import { z } from 'zod';

export const StreamItemSchema = z.object({
  type: z.enum(['SUB', 'DUB']),
  url: z.string().url().or(z.string().min(1)),
  provider: z.string(),
  headers: z.record(z.string()).optional(),
});

export const StreamsResponseSchema = z.object({
  success: z.literal(true),
  provider: z.string(),
  streams: z.array(StreamItemSchema),
  cached: z.boolean(),
});

export const DiscoveryItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  image: z.string(),
  url: z.string(),
  episodes: z.number().int().optional(),
  type: z.string().optional(),
});

export const DiscoveryResponseSchema = z.object({
  success: z.literal(true),
  items: z.array(DiscoveryItemSchema),
  cached: z.boolean(),
});
