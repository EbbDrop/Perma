import { getAuthUserId, createAccount, modifyAccountCredentials } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { QueryCtx, query, mutation, ActionCtx } from "./_generated/server";
import { idFromGroupAndName } from "./auth";

/**
 * Get the currently logged in user, or throw an error if not logged in.
 */
export async function getAuthUser(ctx: QueryCtx) {
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

/**
 * Get the group of the currently logged in user, or throw an error if not logged in.
 */
async function getAuthGroup(ctx: QueryCtx) {
    const user = await getAuthUser(ctx);
    const group = await ctx.db.get("group", user.group);
    if (group === null) {
        throw Error("Invalid group for valid user???");
    }
    return group;
}

/**
 * @returns A list of all the groups 
 */
export const allGroups = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("group").collect();
    },
});

/**
 * @returns
 */
export const groupInfo = query({
    args: {},
    handler: async (ctx) => {
        const group = getAuthGroup(ctx);
        return group;
    },
});

/**
 * Adds a single user to the group of the logged in user.
 */
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

        const id = idFromGroupAndName(user.group, args.name);
        await createAccount(ctx as unknown as ActionCtx, {
            provider: "password",
            account: { id, secret: args.password },
            profile: {
                name: args.name,
                group: user.group,
                admin: false,
                assisted: false,
            }
        });
    },
});

/**
 * Change some data about the given user. Only admins can make other users admins.
 * @see {@link updateUserPassword} to update a password
 * @see {@link updateUserName} to update a name
 */
export const updateUser = mutation({
    args: {
        user: v.id("users"),

        data: v.object({
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

        ctx.db.patch("users", args.user, args.data);
    },
});

/**
 * Change the password of a user. If `user` is not given the password of the currently loged in user
 * is changed. Otherwise the given users password is changed (Only posible if the loged in user is
 * an admin).
 */
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

/**
 * Change the name of a user. If `user` is not given the name of the currently loged in user
 * is changed. Otherwise the given users name is changed (Only posible if the loged in user is
 * an admin).
 */
export const updateUserName = mutation({
    args: {
        user: v.optional(v.id("users")),
        name: v.string()
    },

    handler: async (ctx, args) => {
        const authUser = await getAuthUser(ctx);
        if (args.user !== undefined && !authUser.admin) {
            throw Error("Need to be admin to modify other persons name");
        }

        var user = authUser;
        if (args.user !== undefined) {
            const otherUser = await ctx.db.get("users", args.user);
            if (otherUser === null) {
                throw Error("Invalid user");
            }
            user = otherUser;
        }

        const oldId = idFromGroupAndName(user.group, user.name);
        const newId = idFromGroupAndName(user.group, args.name);
        const newIdAcount = await ctx.db.query("authAccounts")
            .withIndex("providerAndAccountId", q => q.eq("provider", "password")
                .eq("providerAccountId", newId))
            .unique();
        if (newIdAcount !== null) {
            throw Error("User with name already exists");
        }

        const account = await ctx.db.query("authAccounts")
            .withIndex("providerAndAccountId", q => q.eq("provider", "password")
                .eq("providerAccountId", oldId))
            .unique();
        if (account === null) {
            throw Error("Invalid user");
        }

        await ctx.db.patch("authAccounts", account?._id, { providerAccountId: newId });
        await ctx.db.patch("users", user._id, { name: args.name });
    },
});

/**
 * Delet a user, only available to admins.
 */
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
            ctx.db.delete("authAccounts", account._id);
        }
        ctx.db.delete("users", args.user);
    },
});

/**
 * @returns Data about the currently loged in user..
 */
export const user = query({
    args: {},
    handler: async (ctx) => {
        const user = await getAuthUser(ctx);
        return user;
    },
});

/**
 * @returns List of all users and their data.
 */
export const users = query({
    args: {},
    handler: async (ctx) => {
        const user = await getAuthUser(ctx);
        return await ctx.db.query("users").withIndex("by_group", q => q.eq("group", user.group)).collect();
    },
});
