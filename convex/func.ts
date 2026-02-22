import { v } from "convex/values";
import { query, mutation, QueryCtx, MutationCtx, ActionCtx } from "./_generated/server";
import { getAuthUserId, createAccount, modifyAccountCredentials } from "@convex-dev/auth/server";
import { idFromGroupAndName } from "./auth";
import { Id, Doc } from "./_generated/dataModel";
import { DateTime } from "luxon";

async function getAuthUser(ctx: QueryCtx) {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw Error("Need to log in");
    }
    const user = await ctx.db.get("users", userId);
    if (user === null) {
      throw Error("Invalid user");
    }
    return user;
}

async function getGroupForUser(ctx: QueryCtx, user: Doc<"users">) {
    const group = await ctx.db.get("group", user.group);
    if (group === null) {
      throw Error("Invalid group for valid user???");
    }
    return group;
}

async function getAuthGroup(ctx: QueryCtx) {
    const user = await getAuthUser(ctx);
    return await getGroupForUser(ctx, user);
}

export const allGroups = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("group").collect();
  },
});

export const groupInfo = query({
  args: {},
  handler: async (ctx) => {
    const group = getAuthGroup(ctx);
    return group;
  },
});

export const addUser = mutation({
  args: {
    name: v.string(),
    password: v.string()
  },

  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user.admin) {
      throw Error("Need to be admin");
    }

    const group = await getGroupForUser(ctx, user);

    const id = idFromGroupAndName(group._id, args.name);
    await createAccount(ctx as unknown as ActionCtx, {
      provider: "password",
      account: { id, secret: args.password },
      profile: {
        name: args.name,
        group: group._id,
        admin: false,
        assisted: false,
      }
    });
  },
});

export const updateUser = mutation({
  args: {
    user: v.id("users"),

    data: v.object({
      name: v.optional(v.string()),
      assisted: v.optional(v.boolean()),
      admin: v.optional(v.boolean()),
    }),
  },

  handler: async (ctx, args) => {
    const authUser = await getAuthUser(ctx);
    if (!authUser.admin) {
      throw Error("Need to be admin");
    }
    if (authUser._id == args.user && args.data.admin === false) {
      return null;
    }

    const user = await ctx.db.get("users", args.user);
    if (user === null || user.group !== authUser.group) {
      throw Error("Invalid user");
    }

    ctx.db.patch("users", args.user, args.data)
  },
});

export const updateUserPassword = mutation({
  args: {
    user: v.optional(v.id("users")),
    password: v.string()
  },

  handler: async (ctx, args) => {
    const authUser = await getAuthUser(ctx);
    if (args.user !== undefined && !authUser.admin) {
      throw Error("Need to be admin to modify other persons password");
    }

    var user = authUser;
    if (args.user !== undefined) {
      const otherUser = await ctx.db.get("users", args.user);
      if (otherUser === null) {
        throw Error("Invalid user");
      }
      user = otherUser;
    }

    const id = idFromGroupAndName(user.group, user.name);
    await modifyAccountCredentials(ctx as unknown as ActionCtx, {
      provider: "password",
      account: { id, secret: args.password },
    });
  },
});

export const deleteUser = mutation({
  args: {
    user: v.id("users"),
  },

  handler: async (ctx, args) => {
    const authUser = await getAuthUser(ctx);
    if (!authUser.admin) {
      throw Error("Need to be admin");
    }
    if (authUser._id === args.user) {
      throw Error("Can't delete yourself");
    }

    const user = await ctx.db.get("users", args.user);
    if (user == null) {
      throw Error("Invalid user");
    }

    const id = idFromGroupAndName(user.group, user.name);
    const account = await ctx.db.query("authAccounts")
      .withIndex("providerAndAccountId", q => q.eq("provider", "password")
      .eq("providerAccountId", id))
      .unique();
    if (account !== null) {
      ctx.db.delete("authAccounts", account._id)
    }
    ctx.db.delete("users", args.user);
  },
});

export const user = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    return user;
  },
});

export const users = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    return await ctx.db.query("users").withIndex("by_group", q => q.eq("group", user.group)).collect();
  },
});

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
      .withIndex("by_group_upcoming", q => q.eq("group", user.group))
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

export const newUpcomingSlot = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user.admin) {
      throw Error("You need to be admin");     
    }

    const lastSlot = await ctx.db.query("slots")
      .withIndex("by_group_upcoming", q => q.eq("group", user.group).eq("upcoming", true))
      .order("desc")
      .first();
    console.log(lastSlot);

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
        upcoming: true
    });
  }
})

export const updateUpcomingSlot = mutation({
  args: {
    slot: v.id("slots"),

    data: v.object({
      name: v.optional(v.string()),
      type: v.optional(v.union(v.null(), v.id("slotType"))),
      showTime: v.optional(v.boolean()),
      start: v.optional(v.string()),
      end: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user.admin) {
      throw Error("You need to be admin");     
    }

    const slot = await ctx.db.get("slots", args.slot);
    if (slot === null || slot.group !== user.group || !slot.upcoming) {
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
    if (slot === null || slot.group !== user.group || !slot.upcoming) {
      throw Error("invalid slot");
    }

    await ctx.db.delete("slots", args.slot);
  }
})

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

    let slotsToEdit = await ctx.db.query("slots")
      .withIndex("by_group_upcoming", q => 
        q.eq("group", user.group)
          .eq("upcoming", true)
          .gte("start", startRange)
          .lt("start", endRange)
      )
      .collect();

    const movedTimes = (slot: Doc<"slots">) => ({
      start: DateTime.fromISO(slot.start).plus({days: args.moveDays}).toUTC().toISO() as string,
      end: DateTime.fromISO(slot.end).plus({days: args.moveDays}).toUTC().toISO() as string,
    });
    
    switch (args.action) {
      case "copy":
        await Promise.all(slotsToEdit.map(slot => {
          return ctx.db.insert("slots", {
              ...movedTimes(slot),
              upcoming: true,
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
    if (slot.upcoming && !user.admin) {
      throw Error("Upcoming slots can only be edited by admins");     
    }
    if (args.performer !== undefined) {
      const performer = await ctx.db.get("users", args.performer);
      if (performer === null || performer.group !== user.group) {
        throw Error("Invalid performer");
      }
    }

    if (!slot.upcoming && slot.type !== null && slot.performer !== args.performer) {
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
      .withIndex("by_group_upcoming", (q) => q.eq("group", user.group).eq("upcoming", true))
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
      .withIndex("by_group_upcoming", q => q.eq("group", user.group)
        .eq("upcoming", false)
        .lt("start", startToday))
      .collect();

    for (const slot of oldSlots) {
      await ctx.db.delete("slots", slot._id);
    }

    const slotsToPublish = await ctx.db.query("slots")
      .withIndex("by_group_upcoming", q => 
        q.eq("group", user.group)
          .eq("upcoming", true)
      )
      .collect();


    const pairs = await Promise.all(slotsToPublish.map(async slot => {
      const start = DateTime.fromISO(slot.start).plus({weeks: 1}).toUTC().toISO() as string;
      const end = DateTime.fromISO(slot.end).plus({weeks: 1}).toUTC().toISO() as string;
      await ctx.db.insert("slots", {
          start,
          end,
          upcoming: true,
          name: slot.name,
          showTime: slot.showTime,
          type: slot.type,
          group: user.group,
      });

      await ctx.db.patch("slots", slot._id, {
        upcoming: false
      })

      const selections = await ctx.db.query("selectedSlots")
        .withIndex("by_slot", q => q.eq("slot", slot._id))
        .collect();

      await Promise.all(selections.map(s => {
        return ctx.db.delete("selectedSlots", s._id);
      }));

      if (slot.performer !== undefined && slot.type !== undefined) {
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

export const slots = query({
  args: {
    upcoming: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);

    return await ctx.db.query("slots")
      .withIndex("by_group_upcoming", (q) => q.eq("group", user.group).eq("upcoming", args.upcoming))
      .collect();
  },
});

export const upcomingSlotsWithSelected = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);

    const slots = await ctx.db.query("slots")
      .withIndex("by_group_upcoming", (q) => q.eq("group", user.group).eq("upcoming", true))
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

export const selectedSlots = query({
  args: {
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const authUser = await getAuthUser(ctx);
    const authGroup = await getGroupForUser(ctx, authUser);

    const user = args.userId === undefined ? authUser : await ctx.db.get("users", args.userId);
    if (user === null) {
      throw Error("Invalid user");
    }
    const userGroup = await getGroupForUser(ctx, user);
    if (authGroup._id !== userGroup._id) {
      throw Error("User is part of diffrent group");
    }

    const slots = await ctx.db.query("selectedSlots").withIndex("by_user", q => q.eq("user", user._id)).collect();
    return slots.map(s => s.slot);
  },
});

export const setSelectedSlot = mutation({
  args: {
    slot: v.id("slots"),
    selected: v.boolean(),
  },
  handler: async (ctx, args) => {
    const authUser = await getAuthUser(ctx);
    const slot = await ctx.db.get("slots", args.slot);
    if (slot == null || slot.group !== authUser.group || !slot.upcoming) {
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

export const setNote = mutation({
  args: {
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    await ctx.db.patch("users", user._id, { note: args.note })
  },
})

export const note = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    return user.note;
  },
})

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
      .withIndex("by_group_upcoming", (q) => q.eq("group", user.group).eq("upcoming", false))
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
