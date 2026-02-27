import { v } from "convex/values";
import { query, mutation, MutationCtx } from "./_generated/server";
import { Id, Doc } from "./_generated/dataModel";
import { DateTime } from "luxon";
import { getAuthUser } from "./usersAndGroups";

/**
 * Add a new slot type
 *
 * Admin only.
 */
export const addSlotTypes = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user.admin) {
      throw Error("You need to be admin");     
    }

    return await ctx.db.insert("slotType", {
        name: "",
        group: user.group,
    });
  },
});

/**
 * Change the name of a slot type.
 *
 * Admin only.
 */
export const updateSlotTypes = mutation({
  args: {
    slotType: v.id("slotType"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user.admin) {
      throw Error("You need to be admin");     
    }
    const slotType = await ctx.db.get("slotType", args.slotType);
    if (slotType === null || slotType.group !== user.group) {
      throw Error("Invalid slot type");
    }

    return await ctx.db.patch("slotType", args.slotType, {name: args.name});
  },
});

/**
 * Delet a slot type.
 *
 * Admin only.
 */
export const deleteSlotTypes = mutation({
  args: {
    slotType: v.id("slotType"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user.admin) {
      throw Error("You need to be admin");     
    }
    const slotType = await ctx.db.get("slotType", args.slotType);
    if (slotType === null || slotType.group !== user.group) {
      throw Error("Invalid slot type");
    }

    const slots = await ctx.db.query("slots")
      .withIndex("by_group_state", q => q.eq("group", user.group))
      .filter(q => q.eq(q.field("type"), args.slotType))
      .collect();
    await Promise.all(slots.map(slot => {
      return ctx.db.patch("slots", slot._id, {type: undefined});
    }));

    const counts = await ctx.db.query("performingCount")
      .withIndex("by_type_user", q => q.eq("type", args.slotType))
      .collect();
    await Promise.all(counts.map(count => {
      return ctx.db.delete("performingCount", count._id);
    }))

    return await ctx.db.delete("slotType", args.slotType);
  },
});

/**
 * @returns A list of all the slot types
 */
export const slotTypes = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    return await ctx.db.query("slotType").withIndex("by_group", q => q.eq("group", user.group)).collect();
  },
});

// Warning: Do not call this function multiple times in the same transaction! The same
// `performer`, `type` pairs will be created.
async function updatePerformingCount(
  ctx: MutationCtx,
  performer: Id<"users">,
  type: Id<"slotType">,
  update: number
) {
  const count = await ctx.db.query("performingCount")
    .withIndex("by_type_user", q => q.eq("type", type).eq("user", performer))
    .unique();
  if (count === null) {
    await ctx.db.insert("performingCount", {
        type,
        user: performer,
        count: update,
    });
  } else {
    await ctx.db.patch("performingCount", count._id, {count: count.count + update });
  }
}

/**
 * Change the counts of a list of users all at once. Only used via the dashboard at the moment.
 */
export const bulkEditCounts = mutation({
  args: {
    updates: v.array(v.object({
      user: v.id("users"),
      type: v.id("slotType"),
      update: v.number(),
    }))
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user.admin) {
      throw Error("You need to be admin");     
    }
    const rawTypes = await ctx.db.query("slotType")
      .withIndex("by_group", q => q.eq("group", user.group))
      .collect();
    const types = new Set(rawTypes.map(t => t._id));

    const rawUsers = await ctx.db.query("users")
      .withIndex("by_group", q => q.eq("group", user.group))
      .collect();
    const users = new Set(rawUsers.map(u => u._id));

    for (const {user, type, update} of args.updates) {
      if (!types.has(type)) {
        throw Error(`invlid type: ${type}`);
      }
      if (!users.has(user)) {
        throw Error(`invlid user: ${user}`);
      }

      updatePerformingCount(ctx, user, type, update);
    }
  },
})

/**
 * Move the counts from one slot type to another slot type.
 *
 * Admin only.
 */
export const transferCounts = mutation({
  args: {
    fromType: v.id("slotType"),
    toType: v.id("slotType"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user.admin) {
      throw Error("You need to be admin");     
    }
    const fromType = await ctx.db.get("slotType", args.fromType);
    if (fromType === null) {
      throw Error("Invlid fromType");
    }
    const toType = await ctx.db.get("slotType", args.toType);
    if (toType === null) {
      throw Error("Invlid toType");
    }

    const counts = await ctx.db.query("performingCount")
      .withIndex("by_type_user", q => q.eq("type", args.fromType))
      .collect();

    for (const count of counts) {
      updatePerformingCount(ctx, count.user, args.fromType, -count.count);
      updatePerformingCount(ctx, count.user, args.toType, count.count);
    }
  },
})

export type CountData = {
    _id: Id<"slotType">;
    counts: Record<Id<"users">, number>;
    sum: number,
    name: string;
};
export type CountsData = {
  types: CountData[],
  users: Doc<"users">[],
  out_of: number,
};
/**
 * @returns all the data needed to draw a table of all the counts for all users and all slot types.
 */
export const countsTable = query({
  args: {},
  handler: async (ctx): Promise<CountsData> => {
    const authUser = await getAuthUser(ctx);
    const users  = await ctx.db.query("users")
      .withIndex("by_group", q => q.eq("group", authUser.group))
      .collect();

    const types = await ctx.db.query("slotType")
      .withIndex("by_group", q => q.eq("group", authUser.group))
      .collect();

    const asistands = new Set(users.filter(u => !u.assisted).map(u => u._id));

    var usersWithNonZeroCounts = new Set();
    var typesWithCounts: CountData[] = [];
    for (const type of types) {
      const rawCounts = await ctx.db.query("performingCount")
        .withIndex("by_type_user", q => q.eq("type", type._id))
        .collect();
      const counts = new Map(rawCounts.map(c => [c.user, c.count]));
      var sum = 0;
      for (const [u, c] of counts.entries()) {
        if (c !== 0) {
          usersWithNonZeroCounts.add(u);
        }
        if (asistands.has(u)) {
          sum += c;
        }
      }

      typesWithCounts.push({
        counts: Object.fromEntries(counts),
        sum,
        _id: type._id,
        name: type.name,
      });
    }

    const usersToShow = users.filter(u => !u.assisted || usersWithNonZeroCounts.has(u._id));

    return {
      users: usersToShow,
      out_of: asistands.size,
      types: typesWithCounts,
    };
  },
});

function compareSlots(a: Doc<"slots">, b: Doc<"slots">) {
  if (a.start < b.start) {
    return -1;
  }
  if (a.start > b.start) {
    return 1;
  }
  return 0;
}

/**
 * Add a new upcoming slot. Afther the last slot or if this is the first slot it is added today at 8
 *
 * Admin only.
 */
export const newUpcomingSlot = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user.admin) {
      throw Error("You need to be admin");     
    }

    const lastSlot = await ctx.db.query("slots")
      .withIndex("by_group_state", q => q.eq("group", user.group).eq("state", "upcoming"))
      .order("desc")
      .first();

    var start = DateTime.now().set({ hour: 8, minute: 0, second: 0, millisecond: 0});
    if (lastSlot !== null) {
      const lastSlotEnd = DateTime.fromISO(lastSlot.end);
      if (lastSlotEnd.isValid) {
        start = lastSlotEnd;
      }
    }
    start = start.toUTC();
    const end = start.plus({ hours: 1 });

    return await ctx.db.insert("slots", {
        name: "",
        type: null,
        group: user.group,
        showTime: true,
        start: start.toISO(),
        end: end.toISO(),
        state: "upcoming",
    });
  }
})

/**
 * Change some data about a upcoming slot.
 *
 * Admin only.
 */
export const updateUpcomingSlot = mutation({
  args: {
    slot: v.id("slots"),

    data: v.object({
      name: v.optional(v.string()),
      type: v.optional(v.union(v.null(), v.id("slotType"))),
      showTime: v.optional(v.boolean()),
      start: v.optional(v.string()),
      end: v.optional(v.string()),
      state: v.optional(v.union(v.literal("upcoming"), v.literal("hidden")))
    }),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user.admin) {
      throw Error("You need to be admin");     
    }

    const slot = await ctx.db.get("slots", args.slot);
    if (slot === null || slot.group !== user.group || slot.state === "published") {
      throw Error("invalid slot");
    }

    if (args.data.start !== undefined) {
      const start = DateTime.fromISO(args.data.start).toUTC();
      const end = DateTime.fromISO(slot.end).toUTC();
      if (end < start) {
        args.data.end = start.toISO() as string;
      }

      args.data.start = start.toISO() as string;
    }
    if (args.data.end !== undefined) {
      const end = DateTime.fromISO(args.data.end).toUTC();
      const start = DateTime.fromISO(slot.start).toUTC();
      if (end < start) {
        args.data.start = end.toISO() as string;
      }
      args.data.end = end.toISO() as string;
    }

    await ctx.db.patch("slots", args.slot, args.data);
  }
})

/**
 * Delete a upcoing slot.
 *
 * Admin only.
 */
export const deleteUpcomingSlot = mutation({
  args: {
    slot: v.id("slots"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user.admin) {
      throw Error("You need to be admin");     
    }

    const slot = await ctx.db.get("slots", args.slot);
    if (slot === null || slot.group !== user.group || slot.state === "published") {
      throw Error("invalid slot");
    }

    await ctx.db.delete("slots", args.slot);
  }
})

/**
 * "move", "copy" or "delete" a range of upcoming slots, the range is defined by a inclusive start
 * date and a NON inclusive end date. The start date is used to identify the slots. `move" and
 * "copy"`move the slots `moveDays` amount of days. This is not used for "delete".
 *
 * Admin only.
 */
export const rangeEditUpcomingSlots = mutation({
  args: {
    startRange: v.string(),
    endRange: v.string(),
    moveDays: v.number(),
    action: v.union(v.literal("move"), v.literal("copy"), v.literal("delete"))
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user.admin) {
      throw Error("You need to be admin");     
    }

    const startRange = DateTime.fromISO(args.startRange).toUTC().toISO() as string;
    const endRange = DateTime.fromISO(args.endRange).toUTC().toISO() as string;

    var slotsToEdit = await ctx.db.query("slots")
      .withIndex("by_group_state", q => 
        q.eq("group", user.group)
          .eq("state", "upcoming")
          .gte("start", startRange)
          .lt("start", endRange)
      )
      .collect();
    slotsToEdit = slotsToEdit.concat(await ctx.db.query("slots")
      .withIndex("by_group_state", q => 
        q.eq("group", user.group)
          .eq("state", "hidden")
          .gte("start", startRange)
          .lt("start", endRange)
      )
      .collect());
    slotsToEdit.sort(compareSlots);

    const movedTimes = (slot: Doc<"slots">) => ({
      start: DateTime.fromISO(slot.start).plus({days: args.moveDays}).toUTC().toISO() as string,
      end: DateTime.fromISO(slot.end).plus({days: args.moveDays}).toUTC().toISO() as string,
    });
    
    switch (args.action) {
      case "copy":
        await Promise.all(slotsToEdit.map(slot => {
          return ctx.db.insert("slots", {
              ...movedTimes(slot),
              state: slot.state,
              name: slot.name,
              type: slot.type,
              showTime: slot.showTime,
              group: user.group,
          });
        }));
        break;
      case "move":
        await Promise.all(slotsToEdit.map(slot => {
          return ctx.db.patch("slots", slot._id, movedTimes(slot));
        }));
        break;
      case "delete":
        await Promise.all(slotsToEdit.map(slot => {
          return ctx.db.delete("slots", slot._id);
        }));
        break;
    }
  }
});

/**
 * Change the performer of a slot. Changing the performer of a upcoming slot can only be done by
 * admins.
 */
export const slotsSetPerformer = mutation({
  args: {
    slot: v.id("slots"),
    performer: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const slot = await ctx.db.get("slots", args.slot);
    if (slot === null || slot.group !== user.group) {
      throw Error("Invalid slot");
    }
    if (slot.state !== "published" && !user.admin) {
      throw Error("Upcoming slots can only be edited by admins");     
    }
    if (args.performer !== undefined) {
      const performer = await ctx.db.get("users", args.performer);
      if (performer === null || performer.group !== user.group) {
        throw Error("Invalid performer");
      }
    }

    if (slot.state === "published" && slot.type !== null && slot.performer !== args.performer) {
      if (slot.performer !== undefined) {
        await updatePerformingCount(ctx, slot.performer, slot.type, -1);
      }
      if (args.performer !== undefined) {
        await updatePerformingCount(ctx, args.performer, slot.type, 1);
      }
    }

    await ctx.db.patch("slots", args.slot, { performer: args.performer });
  },
})

/**
 * Automaticly try to fill in the upcoming schedule in a fair way.
 *
 * Admin only.
 */
export const autoSetPerformerUpcoming = mutation({
  args: {
    replace: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user.admin) {
      throw Error("You need to be admin");     
    }

    const slots = await ctx.db.query("slots")
      .withIndex("by_group_state", (q) => q.eq("group", user.group).eq("state", "upcoming"))
      .collect();
    const types = await ctx.db.query("slotType")
      .withIndex("by_group", (q) => q.eq("group", user.group))
      .collect();

    var counts: Record<Id<"slotType">, Record<Id<"users">, number>> = {};
    for (const type of types) {
      const rawCounts = await ctx.db.query("performingCount")
        .withIndex("by_type_user", q => q.eq("type", type._id))
        .collect()

      counts[type._id] = Object.fromEntries(
        rawCounts.map(c => [c.user, c.count])
      );
    }

    // If not replacing: Take the already set slots into acount
    if (!args.replace) {
      for (const slot of slots) {
        if (slot.type !== null && slot.performer !== undefined) {
          counts[slot.type][slot.performer] = (counts[slot.type][slot.performer] ?? 0) + 1;
        }
      }
    }

    for (const slot of slots) {
      if (slot.performer !== undefined && !args.replace) {
        continue;
      }
      const selected_by = await ctx.db.query("selectedSlots")
        .withIndex("by_slot", q => q.eq("slot", slot._id))
        .collect();
      if (selected_by.length === 0) {
        continue;
      }

      var selectedUser;
      if (slot.type === null) {
        selectedUser = selected_by[Math.floor(Math.random() * selected_by.length)].user;
      } else {
        const type = slot.type;
        let countsAndUserIds = selected_by.map(s => ({count: counts[type][s.user] ?? 0, user: s.user}));
        countsAndUserIds.sort((a, b) => a.count - b.count);
        selectedUser = countsAndUserIds[0].user;

        counts[type][selectedUser] = (counts[type][selectedUser] ?? 0) + 1;
      }

      ctx.db.patch("slots", slot._id, {performer: selectedUser});
    }
  },
});

/**
 * Publish the upcoming slots by making them visible. The upcming slots are also copied to the next
 * week. All selection by users are removed and their nodes are deleted.
 *
 * Any slot that start before the day in `now` are removed from the old schedule. Set `now` in the
 * local timezone to make the day border lignup.
 *
 * Admin only.
 */
export const publishUpcoming = mutation({
  args: {
    now: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user.admin) {
      throw Error("You need to be admin");     
    }


    const startToday = DateTime.fromISO(args.now).startOf('day').toUTC().toISO() as string;

    const oldSlots = await ctx.db.query("slots")
      .withIndex("by_group_state", q => q.eq("group", user.group)
        .eq("state", "published")
        .lt("start", startToday))
      .collect();

    for (const slot of oldSlots) {
      await ctx.db.delete("slots", slot._id);
    }

    var slotsToPublish = await ctx.db.query("slots")
      .withIndex("by_group_state", q => 
        q.eq("group", user.group)
          .eq("state", "upcoming")
      )
      .collect();
    slotsToPublish = slotsToPublish.concat(await ctx.db.query("slots")
      .withIndex("by_group_state", q => 
        q.eq("group", user.group)
          .eq("state", "hidden")
      )
      .collect());

    const pairs = await Promise.all(slotsToPublish.map(async slot => {
      const start = DateTime.fromISO(slot.start).plus({weeks: 1}).toUTC().toISO() as string;
      const end = DateTime.fromISO(slot.end).plus({weeks: 1}).toUTC().toISO() as string;
      await ctx.db.insert("slots", {
          start,
          end,
          state: slot.state,
          name: slot.name,
          showTime: slot.showTime,
          type: slot.type,
          group: user.group,
      });

      if (slot.state === "hidden") {
        await ctx.db.delete("slots", slot._id)
      } else {
        await ctx.db.patch("slots", slot._id, {
          state: "published",
        })
      }

      const selections = await ctx.db.query("selectedSlots")
        .withIndex("by_slot", q => q.eq("slot", slot._id))
        .collect();

      await Promise.all(selections.map(s => {
        return ctx.db.delete("selectedSlots", s._id);
      }));

      if (slot.performer !== undefined && slot.type !== undefined && slot.state !== "hidden") {
        // This will be used as the keys for the map bellow, object are compared by ptr so need to
        // convert to a string. But later in updatePerformingCount we need the id's again so using
        // `|` to be able to do the split.
        //
        // Using the map to sum the counts (instead of just calling updatePerformingCount here) is
        // needed since the inserts in that function are only done at the end of the transaction =>
        // next call will not see a new count was already created and multiple of the same id pairs
        // will exsit.
        return slot.performer + "|" + slot.type;
      }
      return null;
    }));

    let counts = new Map<string, number>();
    for (const p of pairs) {
      if (p !== null) {
        counts.set(p, (counts.get(p) ?? 0) + 1)
      }
    }

    for (const [p, c] of counts) {
      const [performer, type] = p.split("|");
      updatePerformingCount(ctx, performer as Id<"users">, type as Id<"slotType">, c);
    }

    const users = await ctx.db.query("users")
      .withIndex("by_group", q => q.eq("group", user.group))
      .collect();
    for (const user of users) {
      ctx.db.patch("users", user._id, {note: undefined});
    }
  }
});

/**
 * @returns Returns all slots with a sertain `stater`.
 */
export const slots = query({
  args: {
    state: v.union(v.literal("published"), v.literal("upcoming"), v.literal("upcoming+hidden")),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);

    var slots = await ctx.db.query("slots")
      .withIndex("by_group_state", (q) => q.eq("group", user.group).eq("state", (args.state === "published") ? "published" : "upcoming"))
      .collect();
    if (args.state === "upcoming+hidden") {
      slots = slots.concat(await ctx.db.query("slots")
        .withIndex("by_group_state", (q) => q.eq("group", user.group).eq("state", "hidden"))
        .collect());
      slots.sort(compareSlots);
    }
    return slots;
  },
});

/**
 * @returns The list of upcoming slots with the users have and have not selected atached as extra
 * data to every slot.
 */
export const upcomingSlotsWithSelected = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);

    const slots = await ctx.db.query("slots")
      .withIndex("by_group_state", (q) => q.eq("group", user.group).eq("state", "upcoming"))
      .collect();

    const rawUsers = await ctx.db.query("users")
      .withIndex("by_group", q => q.eq("group", user.group))
      .collect();
    const users = rawUsers.map(u => ({
      _id: u._id,
      name: u.name,
    }));

    const slotsWithUsers = slots.map(async (slot) => {
      const selected_by = await ctx.db.query("selectedSlots")
        .withIndex("by_slot", q => q.eq("slot", slot._id))
        .collect();
      const selected_user_ids = new Set(selected_by.map(s => s.user));

      return {
        selected_users: users.filter(u => selected_user_ids.has(u._id)),
        not_selected_users: users.filter(u => !selected_user_ids.has(u._id)),
        ...slot,
      };
    });

    return await Promise.all(slotsWithUsers);
  },
});

/**
 * @returns Retuns a list of users who have not select any slots or have not set a note yet.
 */
export const waitingOnSelection = query({
  args: {},
  handler: async (ctx) => {
    const authUser = await getAuthUser(ctx);

    var users = await ctx.db.query("users")
      .withIndex("by_group", q => q.eq("group", authUser.group))
      .collect();

    var waitingOn: {_id: Id<"users">, name: string}[] = [];
    for (const user of users) {
      if (user.note !== undefined || user.assisted) {
        continue;
      }
      const selection = await ctx.db.query("selectedSlots")
        .withIndex("by_user", q => q.eq("user", user._id))
        .first();
      if (selection !== null) {
        continue;
      }
      waitingOn.push({
        _id: user._id,
        name: user.name,
      });
    }

    return waitingOn;
  },
});

/**
 * @returns Retuns the list of slots the current user has selected.
 */
export const selectedSlots = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);

    const slots = await ctx.db.query("selectedSlots")
      .withIndex("by_user", q => q.eq("user", user._id))
      .collect();

    return slots.map(s => s.slot);
  },
});

/**
 * Select or unselect a slot as the current loged in user.
 */
export const setSelectedSlot = mutation({
  args: {
    slot: v.id("slots"),
    selected: v.boolean(),
  },
  handler: async (ctx, args) => {
    const authUser = await getAuthUser(ctx);
    const slot = await ctx.db.get("slots", args.slot);
    if (slot == null || slot.group !== authUser.group || slot.state !== "upcoming") {
      throw Error("Invalid slot")
    }

    const exsisting = await ctx.db.query("selectedSlots")
      .withIndex("by_user_slot", (q) => q.eq("user", authUser._id).eq("slot", args.slot))
      .collect();

    if (args.selected) {
      if (exsisting.length === 0) {
        ctx.db.insert("selectedSlots", {user: authUser._id,slot: args.slot});
      }
    } else {
      /// Only one should ever exist, but still looping in case of..
      for (const s of exsisting) {
        ctx.db.delete("selectedSlots", s._id);
      }
    }
  },
})

/**
 * Set a not as the curretnly logged in user.
 */
export const setNote = mutation({
  args: {
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    await ctx.db.patch("users", user._id, { note: args.note })
  },
})

/**
 * @returns Get the note of the currenly loged in user.
 */
export const note = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    return user.note;
  },
})

/**
 * @returns Retuns the schedule to create the ics calender data. You don't need to be
 * authenticated to use this so that the calendar can be intergrated in other calendar products.
 */
export const slotsForCalendar = query({
  args: {
    group: v.id("group"),
    user: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.user);
    if (user === null || user.group !== args.group) {
      throw Error("Invalid user");
    }
    
    const slots = await ctx.db.query("slots")
      .withIndex("by_group_state", (q) => q.eq("group", user.group).eq("state", "published"))
      .collect();

    const slotsWithUsers = slots.map(async (slot) => {
      var performerUser = null;
      if (slot.performer !== undefined) {
        const rawUser = await ctx.db.get("users", slot.performer);
        if (rawUser !== null) {
          performerUser = {
            _id: rawUser._id,
            name: rawUser.name,
          }
        }
      }

      return {
        performerUser,
        is_you: slot.performer === user._id,
        ...slot,
      };
    });

    return {
      slots: await Promise.all(slotsWithUsers),
      you: user,
    };
  },
});
