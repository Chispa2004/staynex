import { z } from 'zod';

export const AI_INTENTS = [
  'hotel_info',
  'housekeeping_request',
  'maintenance_issue',
  'transport_request',
  'restaurant_booking',
  'spa_booking',
  'room_service',
  'complaint',
  'emergency',
  'human_escalation',
  'unknown'
];

export const TICKET_CATEGORIES = [
  'housekeeping',
  'maintenance',
  'transport',
  'restaurant',
  'spa',
  'room_service',
  'reception',
  'complaint',
  'emergency'
];

export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

export const aiResponseSchema = z.object({
  intent: z.enum(AI_INTENTS),
  confidence: z.number().min(0).max(1),
  reply: z.string().min(1),
  create_ticket: z.boolean(),
  ticket: z.object({
    category: z.enum(TICKET_CATEGORIES).nullable(),
    title: z.string().nullable(),
    description: z.string().nullable(),
    priority: z.enum(TICKET_PRIORITIES).nullable()
  }),
  escalate_to_human: z.boolean(),
  emergency: z.boolean(),
  upsell_opportunity: z.boolean()
}).strict();

export const aiResponseJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'intent',
    'confidence',
    'reply',
    'create_ticket',
    'ticket',
    'escalate_to_human',
    'emergency',
    'upsell_opportunity'
  ],
  properties: {
    intent: {
      type: 'string',
      enum: AI_INTENTS
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1
    },
    reply: {
      type: 'string'
    },
    create_ticket: {
      type: 'boolean'
    },
    ticket: {
      type: 'object',
      additionalProperties: false,
      required: ['category', 'title', 'description', 'priority'],
      properties: {
        category: {
          anyOf: [
            { type: 'string', enum: TICKET_CATEGORIES },
            { type: 'null' }
          ]
        },
        title: {
          anyOf: [
            { type: 'string' },
            { type: 'null' }
          ]
        },
        description: {
          anyOf: [
            { type: 'string' },
            { type: 'null' }
          ]
        },
        priority: {
          anyOf: [
            { type: 'string', enum: TICKET_PRIORITIES },
            { type: 'null' }
          ]
        }
      }
    },
    escalate_to_human: {
      type: 'boolean'
    },
    emergency: {
      type: 'boolean'
    },
    upsell_opportunity: {
      type: 'boolean'
    }
  }
};

export const validateAiResponse = (response) => aiResponseSchema.parse(response);
