import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { DateTime } from "luxon";
import { getAuthUser, getAuthUserGroup } from "./usersAndGroups";

/**
 * Add a new event
 *
 * Admin only.
 */
export const addEvent = mutation({
  args: {
    name: v.string(),
    start: v.string(),
  },
  handler: async (ctx, args) => {
    const [user, group] = await getAuthUserGroup(ctx);
    if (!user.admin) {
      throw Error("You need to be admin");
    }


    let start = DateTime.fromISO(args.start).setZone(group.timezone);
    if (!start.isValid) {
      start = DateTime.now().setZone(group.timezone).set({ minute: 0, second: 0, millisecond: 0 });
    }

    return await ctx.db.insert("event", {
      group: user.group,

      name: args.name,
      start: start.toISO() as string,
      description: "",
      type: null,
    });
  },
});

/**
 * @returns Returns all events.
 */
export const events = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);

    let events = await ctx.db.query("event")
      .withIndex("by_group", (q) => q.eq("group", user.group))
      .collect();
    return events;
  },
});

/**
 * You don't need to be authenticated to use this so that the calendar can be integrated in other
 * calendar products.
 * 
 * @returns Returns all events.
 */
export const eventsForCalendar = query({
  args: {
    group: v.id("group"),
    user: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.user);
    if (user === null || user.group !== args.group) {
      throw Error("Invalid user");
    }

    let events = await ctx.db.query("event")
      .withIndex("by_group", (q) => q.eq("group", user.group))
      .collect();
    return events;
  },
});

/**
 * Update an event
 *
 * Admin only.
 */
export const updateEvent = mutation({
  args: {
    event: v.id("event"),

    data: v.object({
      name: v.optional(v.string()),
      start: v.optional(v.string()),
      description: v.optional(v.string()),
      visible: v.optional(v.boolean()),
      type: v.optional(v.nullable(v.id("eventType"))),
    }),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user.admin) {
      throw Error("You need to be admin");
    }
    const event = await ctx.db.get("event", args.event);
    if (event === null || event.group !== user.group) {
      throw Error("Invalid event");
    }

    return await ctx.db.patch("event", args.event, args.data);
  },
});

/**
 * Delete an event.
 *
 * Admin only.
 */
export const deleteEvent = mutation({
  args: {
    event: v.id("event"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user.admin) {
      throw Error("You need to be admin");
    }
    const event = await ctx.db.get("event", args.event);
    if (event === null || event.group !== user.group) {
      throw Error("Invalid event");
    }

    return await ctx.db.delete("event", args.event);
  },
});


/**
 * Add a new event type
 *
 * Admin only.
 */
export const addEventTypes = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user.admin) {
      throw Error("You need to be admin");     
    }

    return await ctx.db.insert("eventType", {
        name: "",
        group: user.group,
    });
  },
});

/**
 * Change the name of an event type.
 *
 * Admin only.
 */
export const updateEventTypes = mutation({
  args: {
    eventType: v.id("eventType"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user.admin) {
      throw Error("You need to be admin");     
    }
    const eventType = await ctx.db.get("eventType", args.eventType);
    if (eventType === null || eventType.group !== user.group) {
      throw Error("Invalid event type");
    }

    return await ctx.db.patch("eventType", args.eventType, {name: args.name});
  },
});

/**
 * Delete an event type.
 *
 * Admin only.
 */
export const deleteEventTypes = mutation({
  args: {
    eventType: v.id("eventType"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user.admin) {
      throw Error("You need to be admin");     
    }
    const eventType = await ctx.db.get("eventType", args.eventType);
    if (eventType === null || eventType.group !== user.group) {
      throw Error("Invalid event type");
    }

    const events = await ctx.db.query("event")
      .withIndex("by_group", q => q.eq("group", user.group))
      .filter(q => q.eq(q.field("type"), args.eventType))
      .collect();
    await Promise.all(events.map(event => {
      return ctx.db.patch("event", event._id, {type: undefined});
    }));

    return await ctx.db.delete("eventType", args.eventType);
  },
});

/**
 * @returns A list of all the event types
 */
export const eventTypes = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    return await ctx.db.query("eventType").withIndex("by_group", q => q.eq("group", user.group)).collect();
  },
});
