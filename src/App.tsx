"use client";

import {
  Authenticated,
  Unauthenticated,
  useConvexAuth,
  useMutation,
  useQuery,
} from "convex/react";
import { api } from "../convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { ChangeEvent, ReactElement, useEffect, useState } from "react";
import { BrowserRouter, NavLink, Outlet, Route, Routes } from "react-router";
import { DateTime } from "luxon";
import { Doc, Id } from "../convex/_generated/dataModel";

export default function App() {
  var isAdmin = false;
  var name = "";
  try {
    const user = useQuery(api.func.user, {});
    if (user !== undefined) {
      isAdmin = user.admin;
      name = user.name;
    }
  } catch {}
  
  return (
    <BrowserRouter>
      <nav>
        <span>Perma 2000</span>
        <Authenticated>
          <NavLink to="/" end>Schema</NavLink>
          <NavLink to="/invullen" end>Invullen</NavLink>
          {isAdmin ?
            <NavLink to="/admin" end>Admin</NavLink> : null
          }
          <span id="sign-out">
            {name}
            {" "}
            <SignOutButton/>
          </span>
        </Authenticated>
      </nav>
      <main>
        <Authenticated>
          <Routes>
            <Route index element={<Schedule />}/>
            <Route path="invullen" element={<FillIn />}/>
            <Route path="admin" element={<Admin />}>
              <Route index element={<AdminSetPerformer />} />
              <Route path="slots" element={<AdminEditSlots />} />
            </Route>
          </Routes>
        </Authenticated>
        <Unauthenticated>
          <SignInForm />
        </Unauthenticated>
      </main>
    </ BrowserRouter>
  );
}

function SignOutButton() {
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  return (
    <>
      {isAuthenticated && (
        <button
          className="bg-slate-200 dark:bg-slate-800 text-dark dark:text-light rounded-md px-2 py-1"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
      )}
    </>
  );
}

function SignInForm() {
  const groups = useQuery(api.func.allGroups, {}) ?? [];

  const { signIn } = useAuthActions();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-8 w-96 mx-auto">
      <p>Log in to see the numbers</p>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.target as HTMLFormElement);
          void signIn("password", formData).catch((error) => {
            setError(error.message);
          });
        }}
      >
        <select
          className="bg-light dark:bg-dark text-dark dark:text-light rounded-md p-2 border-2 border-slate-200 dark:border-slate-800"
          name="group"
        >
          <option value="" disabled selected>Kies groep</option>
          {...groups.map(group => {
            return <option value={group._id} key={group._id}>{group.name}</option>;
          })}
        </select>
        <input
          className="bg-light dark:bg-dark text-dark dark:text-light rounded-md p-2 border-2 border-slate-200 dark:border-slate-800"
          type="text"
          name="name"
          placeholder="Name"
        />
        <input
          className="bg-light dark:bg-dark text-dark dark:text-light rounded-md p-2 border-2 border-slate-200 dark:border-slate-800"
          type="password"
          name="password"
          placeholder="Password"
        />
        <button
          className="bg-dark dark:bg-light text-light dark:text-dark rounded-md"
          type="submit"
        >
        Login
        </button>
        {error && (
          <div className="bg-red-500/20 border-2 border-red-500/50 rounded-md p-2">
            <p className="text-dark dark:text-light font-mono text-xs">
              Error signing in: {error}
            </p>
          </div>
        )}
      </form>
    </div>
  );
}


function Schedule() {
  const [now, setNow] = useState(DateTime.now())
  useEffect(() => {setTimeout(() => setNow(DateTime.now()), 60000)}, [now])

  const setPerformer = useMutation(api.func.slotsSetPerformer)
    .withOptimisticUpdate((local_store, args) => {
      const slots = local_store.getQuery(api.func.slots, {upcoming: false})?.slice();
      if (slots === undefined) {
        return;
      }
      let idx = slots.findIndex(s => s._id === args.slot);
      if (idx < 0) {
        return;
      }
      var slot = structuredClone(slots[idx]);
      slot.performer = args.performer;
      slots[idx] = slot;
      local_store.setQuery(api.func.slots, {upcoming: false}, slots);
    });

  const user = useQuery(api.func.user, {});
  const users = useQuery(api.func.users, {});
  const slots = useQuery(api.func.slots, {upcoming: false});
  if (slots === undefined || user === undefined || users === undefined) {
    return <h3>Loading</h3>;
  }

  var rightNow = [];
  var htmlData = [];
  var lastDayString = undefined;

  for (const slot of slots) {
    const { start, end, dayString, fullName } = slotStrings(slot);
    if (lastDayString !== dayString) {
      lastDayString = dayString;
      htmlData.push(<h2 className="day-title">{dayString}</h2>);
    }

    if (start <= now && now <= end && slot.performer !== undefined && slot.showTime) {
      const performer = users.find(u => u._id == slot.performer);

      rightNow.push({
        slotName: slot.name,
        performerName: performer?.name ?? "ERROR",
      })
    }

    const you = slot.performer === user._id;

    htmlData.push(<div key={slot._id} className={"slot" + (you ? " you" : "")}>
        {fullName}
        <select onChange={event => {
          event.preventDefault();
          var performer = undefined;
          if (event.target.value !== "") {
            performer = event.target.value as Id<"users">;
          }

          setPerformer({
            slot: slot._id,
            performer,
          })
        }}>
          {...users.map(u => userToOption(u, slot.performer))}
        </select>
    </div>);
  }
  if (htmlData.length === 0) {
    htmlData.push(<h3>(Nog) geen shiften</h3>);
  }

  var rightNowHtml = null;
  if (rightNow.length === 1) {
    rightNowHtml = (<div id="right-now">Heeft nu perma: <strong className="right-now-name">{rightNow[0].performerName}</strong> ({rightNow[0].slotName})</div>);
  } else if (rightNow.length > 1) {
    rightNowHtml = (<div id="right-now">Hebben nu perma: {...rightNow.flatMap(e => [", ", (<span>{e.slotName}: <strong className="right-now-name">{e.performerName}</strong></span>)]).slice(1)}</div>);
  }

  return (<div>
    {rightNowHtml}
    <br/>
    <div className="schedule-container">
    {...htmlData}
    </div>
  </div>);
}

function slotStrings(slot: Doc<"slots">) {
    const start = DateTime.fromISO(slot.start).toLocal();
    const end = DateTime.fromISO(slot.end).toLocal();

    const dayString = start.toLocaleString({ weekday: "long", day: "2-digit", month: "2-digit" });
    
    var fullName = slot.name;
    if (slot.showTime) {
      const startHour = start.toLocaleString(DateTime.TIME_SIMPLE);
      var endHour;
      if (end.hasSame(start, "day")) {
        endHour = end.toLocaleString(DateTime.TIME_SIMPLE);
      } else {
        endHour = end.toLocaleString({ weekday: 'short', hour: '2-digit', minute: '2-digit' });
      }

      fullName += ` (${startHour} tot ${endHour})`
    }

    return {start, end, dayString, fullName};
}

function userToOption(user: Doc<"users">, performer: Id<"users"> | undefined): ReactElement {
  return (
    <option
      value={user._id}
      key={user._id}
      selected={user._id === performer}
    >
      {user.name}
    </option>
  );
}

function AdminEditSlots() {
  const newUpcomingSlot = useMutation(api.func.newUpcommingSlot);
  const updateUpcomingSlot = useMutation(api.func.updateUpcommingSlot);
  const deleteUpcomingSlot = useMutation(api.func.deleteUpcommingSlot);
  const copyUpcommingSlots = useMutation(api.func.copyUpcommingSlots);
  
  const slots = useQuery(api.func.slots, {upcoming: true});
  if (slots === undefined) {
    return <h3>Loading</h3>;
  }

  var htmlDataSlots = [];
  var lastDayString = undefined;

  const toLocal = (utc: string) => {
    let date = DateTime.fromISO(utc).toLocal().toISO({includeOffset: false});
    if (date === null) {
      return undefined;
    }
    return date;
  };

  for (const slot of slots) {
    const { start, dayString } = slotStrings(slot);
    if (lastDayString !== dayString) {
      lastDayString = dayString;

      const startRange = start.startOf('day').toUTC().toISO() as string;
      const endRange = start.endOf('day').toUTC().toISO() as string;

      htmlDataSlots.push(<div className="day-title-big">
        <h3>{dayString}</h3>
        <div className="day-title-buttons">
          <button onClick={_ => {
            copyUpcommingSlots({
                startRange,
                endRange,
                moveDays: 1
            })
          }}>copier naar volgende dag</button>
        </div>
      </div>);
    }

    function onChange(param: string, type: "dt" | "text" | "c") {
      return (event: ChangeEvent<HTMLInputElement, HTMLInputElement>) => {
        var data: Record<string, string | boolean> = {};
        var value: string | boolean = "";
        if (type === "text") {
          value = event.target.value;
        } else if (type == "dt"){
          value = DateTime.fromISO(event.target.value).toUTC().toISO() as string;
        } else if (type === "c") {
          value = event.target.checked;
        }
        data[param] = value;
        updateUpcomingSlot({
          slot: slot._id,
          data,
        })
      }
    }

    htmlDataSlots.push(<div key={slot._id} className="slot slot-edit">
      <label>
        Naam: 
        <input type="text" onBlur={onChange("name", "text")} defaultValue={slot.name}/>
      </label>
      <label>
        Shift soort: 
        <select>
          <option>TODO</option>
        </select>
      </label>
      <label>
        Van: 
        <input type="datetime-local" onChange={onChange("start", "dt")} value={toLocal(slot.start)}/>
      </label>
      <label>
        Tot: 
        <input type="datetime-local" onChange={onChange("end", "dt")} value={toLocal(slot.end)}/>
      </label>
      <label>
        Toon tijd in schema:
        <input type="checkbox" onChange={onChange("showTime", "c")} checked={slot.showTime}/>
      </label>
      <button onClick={_ => deleteUpcomingSlot({slot: slot._id})}>verwijder</button>
    </div>);
  }
  if (htmlDataSlots.length === 0) {
    htmlDataSlots.push(<div>Nog geen shiften gemaakt</div>);
  }

  return (<>
    <div className="schedule-container">
      {...htmlDataSlots}
    </div>
    <br/>
    <button onClick={_ => newUpcomingSlot({})}>Voeg nieuwe shift toe</button>
  </>);
}

function AdminSetPerformer() {
  const publishUpcoming = useMutation(api.func.publishUpcoming);
  const setPerformer = useMutation(api.func.slotsSetPerformer)
    .withOptimisticUpdate((local_store, args) => {
      const slots = local_store.getQuery(api.func.upcomingSlotsWithSelected)?.slice();
      if (slots === undefined) {
        return;
      }
      let idx = slots.findIndex(s => s._id === args.slot);
      if (idx < 0) {
        return;
      }
      var slot = structuredClone(slots[idx]);
      slot.performer = args.performer;
      slots[idx] = slot;
      local_store.setQuery(api.func.upcomingSlotsWithSelected, {}, slots);
    });

  const slots = useQuery(api.func.upcomingSlotsWithSelected);
  if (slots === undefined) {
    return <h3>Loading</h3>;
  }

  var htmlData = [];
  var lastDayString = undefined;

  for (const slot of slots) {
    const { dayString, fullName } = slotStrings(slot);
    if (lastDayString !== dayString) {
      lastDayString = dayString;
      htmlData.push(<h3 className="day-title">{dayString}</h3>);
    }

    const warn = slot.performer !== undefined
      && slot.not_selected_users.map(u => u._id).includes(slot.performer);

    htmlData.push(<label key={slot._id} className="slot">
        <div>
          <span>{fullName}</span>
          {warn && <div className="warn" title="Deze persoon heeft niet aangeduit dat ze konden op deze shift.">⚠️</div>}
        </div>

        <select onChange={event => {
          event.preventDefault();
          var performer = undefined;
          if (event.target.value !== "") {
            performer = event.target.value as Id<"users">;
          }

          setPerformer({
            slot: slot._id,
            performer,
          })
        }}>
          <option value=""></option>
          <option disabled>-- kunnen --</option>
          {...slot.selected_users.map(u => userToOption(u, slot.performer))}
          <option disabled>-- kunnen NIET --</option>
          {...slot.not_selected_users.map(u => userToOption(u, slot.performer))}
        </select>
    </label>);
  }
  if (htmlData.length === 0) {
    htmlData.push(<div>Nog geen shiften gemaakt. Gebruik "shifts bewerken" hierboven om er toe te voegen</div>);
  }

  return (<div>
    <div className="schedule-container">
      {...htmlData}
    </div>
    <hr/>
    <button onClick={_ => publishUpcoming()} id="publish">Publiceer</button>
  </div>);
}

function Admin() {
  return (
    <div>
      <nav>
        <NavLink to="/admin" end>Schema</NavLink>
        <NavLink to="/admin/slots" end>Shifts bewerken</NavLink>
      </nav>
      <br/>
      <Outlet />
    </div>
  );
}

function FillIn() {
  const setSelectedSlot = useMutation(api.func.setSelectedSlot).withOptimisticUpdate((local_store, args) => {
    let currentSelected = local_store.getQuery(api.func.selectedSlots, {});
    if (currentSelected === undefined) {
      return;
    }

    var newSelected;
    if (!args.selected) {
      newSelected = currentSelected.filter(s => s !== args.slot);
    } else {
      newSelected = currentSelected.slice();
      newSelected.push(args.slot);
    }
    local_store.setQuery(api.func.selectedSlots, {}, newSelected);
  });

  const slots = useQuery(api.func.slots, {upcoming: true});
  const selectedSlots = useQuery(api.func.selectedSlots, {});
  if (slots === undefined || selectedSlots == undefined) {
    return <h3>Loading</h3>;
  }
  if (slots.length === 0) {
    return <h3>Geen perma nodig</h3>;
  }

  var htmlData = [];
  var lastDayString = undefined;

  for (const slot of slots) {
    const { dayString, fullName } = slotStrings(slot);    

    if (lastDayString !== dayString) {
      lastDayString = dayString;
      htmlData.push(<h2 className="day-title">{dayString}</h2>);
    }

    const checked = selectedSlots.includes(slot._id);

    htmlData.push(<label key={slot._id} className="slot fill-in-slot">
        {fullName}
        <input type="checkbox" checked={checked} onChange={event => {
          event.preventDefault();
          setSelectedSlot({
            slot: slot._id,
            selected: event.target.checked,
          })
        }}/>
    </label>);
  }

  return (
    <div className="schedule-container">
     {...htmlData}
    </div>
  );
}
