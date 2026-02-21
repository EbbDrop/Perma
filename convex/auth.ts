import { convexAuth } from "@convex-dev/auth/server";
import {
  ConvexCredentials,
} from "@convex-dev/auth/providers/ConvexCredentials";
import {
  retrieveAccount,
} from "@convex-dev/auth/server";
import {
  GenericDataModel,
} from "convex/server";
import { Scrypt } from "lucia";

export function idFromGroupAndName(group: string, name: string) {
  return `${group}-${name}`;
}

/**
 * The available options to a {@link Password} provider for Convex Auth.
 */
export interface PasswordConfig {
  /**
   * Uniquely identifies the provider, allowing to use
   * multiple different {@link Password} providers.
   */
  id?: string;
}

/**
 * Name and password authentication provider.
 *
 * Passwords are by default hashed using Scrypt from Lucia.
 * You can customize the hashing via the `crypto` option.
 *
 * Email verification is not required unless you pass
 * an email provider to the `verify` option.
 */
export function Password<DataModel extends GenericDataModel>(
  config: PasswordConfig = {},
) {
  const provider = config.id ?? "password";
  return ConvexCredentials<DataModel>({
    id: "password",
    authorize: async (params, ctx) => {
      const name = params.name as string;
      if (name === undefined) {
        throw new Error("Missing `name` param");
      }
      const groupId = params.group as string;
      if (groupId === undefined) {
        throw new Error("Missing `groupId` param");
      }
      const password = params.password as string;
      if (password === undefined) {
        throw new Error("Missing `password` param");
      }

      const id = idFromGroupAndName(groupId, name);

      const retrieved = await retrieveAccount(ctx, {
        provider,
        account: { id, secret: password },
      });
      if (retrieved === null) {
        throw new Error("Invalid credentials");
      }
      return { userId: retrieved.user._id };
    },
    crypto: {
      async hashSecret(password: string) {
        return await new Scrypt().hash(password);
      },
      async verifySecret(password: string, hash: string) {
        return await new Scrypt().verify(hash, password);
      },
    },
    extraProviders: [],
    ...config,
  });
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});
