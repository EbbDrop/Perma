import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { api } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import ical from "ical-generator";
import { DateTime } from "luxon";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({
    method: "GET",
    path: "/calendar.ics",
    handler: httpAction(async (ctx, request) => {
      const url = new URL(request.url);
      const user = url.searchParams.get("user");
      const group = url.searchParams.get("group");
      const all = (url.searchParams.get("all") || "false") !== "false";
      if (user === null || group === null) {
        return new Response("Need to specify group and user", {
          status: 400
        });
      }

      const {you, slots} = await ctx.runQuery(api.func.slotsForCalendar, {
          user: user as Id<"users">,
          group: group as Id<"group">,
      });

      var nameCalendar = "Permanentie";
      if (!all) {
        nameCalendar += " ";
        nameCalendar += you.name;
      }

      const calendar = ical({
        name: nameCalendar,
        ttl: 60,
        prodId: {
          company: "EbbDrop inc.",
          product: "Perma",
          language: "NL",
        },
      });

      for (const slot of slots) {
        if (slot.performerUser === null) {
          continue;
        }
        if (!all && !slot.is_you) {
          continue;
        }

        var name;
        if (all) {
          name = `${slot.performerUser.name} (${slot.name})`;
        } else {
          name = `${slot.name}`;
        }
        calendar.createEvent({
          summary: name,

          start: DateTime.fromISO(slot.start),
          end: DateTime.fromISO(slot.end),

          allDay: !slot.showTime,

          id: slot._id,
          stamp: DateTime.fromMillis(slot._creationTime),
        });
      }

      return new Response(calendar.toString(), {
        status: 200,
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': 'attachment; filename="calendar.ics"'
        }
      });
    })
})

export default http;
