import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// The schema is normally optional, but Convex Auth
// requires indexes defined on `authTables`.
// The schema provides more precise TypeScript types.
export default defineSchema({
  ...authTables,
  users: defineTable({
    // From auth lib
    name: v.string(),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // Custom uses data
    assisted: v.boolean(),
    note: v.optional(v.string()),
    admin: v.boolean(),
    group: v.id("group"),
  }).index("email", ["email"])
    .index("by_group", ["group", "name"]),

  group: defineTable({
    name: v.string(),
  }),

  slotType: defineTable({
    group: v.id("group"),
    name: v.string(),
  }).index("by_group", ["group"]),

  slots: defineTable({
    group: v.id("group"),

    type: v.nullable(v.id("slotType")),
    name: v.string(),
    showTime: v.boolean(),

    // Start date and time
    start: v.string(),
    // End date and time
    end: v.string(),

    performer: v.optional(v.id("users")),

    state: v.union(v.literal("published"), v.literal("upcoming"), v.literal("hidden")),
  }).index("by_group_state", ["group", "state", "start"]),
    
  selectedSlots: defineTable({
    user: v.id("users"),
    slot: v.id("slots"),
  }).index("by_user", ["user"])
    .index("by_slot", ["slot"])
    .index("by_user_slot", ["user", "slot"]),

  performingCount: defineTable({
    user: v.id("users"),
    type: v.id("slotType"),
    count: v.number(),
  }).index("by_type_user", ["type", "user"])
});
