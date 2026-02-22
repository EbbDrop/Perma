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
import { CountsData } from "../convex/func";
import EtnaImg from "./static/etna.svg?react";

export default function App() {
  var isAdmin = false;
  var name = "";
  var user;
  try {
    user = useQuery(api.func.user, {});
  } catch {}

  if (user !== undefined) {
    isAdmin = user.admin;
    name = user.name;
  }
  
  return (
    <BrowserRouter>
      <nav>
        <EtnaImg className="logo"/>
        <Authenticated>
          <NavLink to="/" end>Schema</NavLink>
          <NavLink to="/invullen" end>Invullen</NavLink>
          {isAdmin ?
            <NavLink to="/admin" end>Admin</NavLink> : null
          }
          <span id="sign-out">
            <NavLink to="/me" end>{name}</NavLink>
            {" "}
            <SignOutButton/>
          </span>
        </Authenticated>
      </nav>
      <main>
        <Authenticated>
          <Routes>
            <Route index element={<>
              <title>Perma | Schema</title>
              <Schedule />
            </>}/>
            <Route path="invullen" element={<>
              <title>Perma | Invullen</title>
              <FillIn />
            </>}/>
            <Route path="me" element={<>
              <title>Perma | {name}</title>
              <Me me={user}/>
            </>}/>
            <Route path="admin" element={<Admin />}>
              <Route index element={<>
                <title>Perma | Maak Schema</title>
                <AdminSetPerformer />
              </>} />
              <Route path="slots" element={<>
                <title>Perma | Edit Shifts</title>
                <AdminEditSlots />
                <hr />
                <h2>Shift soorten</h2>
                <AdminEditTypes />
              </>} />
              <Route path="users" element={<>
                <title>Perma | Kot genoten</title>
                <AdminEditUsers />
              </>} />
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
    <div>
      <form
        id="login"
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.target as HTMLFormElement);
          void signIn("password", formData).catch(_ => {
            setError("Foute naam of wachtwoord. (Vraag de perma verantwoordelijke om jou wachtwoord te veranderen als je het ben vergeten.)");
          });
        }}
      >
        <label>
          Groep
          <select name="group">
            {...groups.map(group => {
              return <option value={group._id} key={group._id}>{group.name}</option>;
            })}
          </select>
        </label>
        <label>
          Naam
          <input type="text" name="name" required />
        </label>
        <label>
          Password
          <input type="password" name="password" required />
        </label>
        <button type="submit">Login</button>
        {error && (
          <div className="error">
            {error}
          </div>
        )}
      </form>
    </div>
  );
}

function Me({me}: {me: Doc<"users"> | undefined}) {
  if (me === undefined) {
    return <h3>Aan het laden</h3>;
  }
  const updateUserPassword = useMutation(api.func.updateUserPassword);

  const baseUrl = import.meta.env.VITE_CONVEX_SITE_URL as string
  const calendarUrl = `${baseUrl}/calendar.ics?group=${me.group}&user=${me._id}`;
  const calendarAllUrl = `${calendarUrl}&all=true`;

  return (<>
    <h2>{me.name}</h2>
    <button onClick={_ => {
      const password = window.prompt("Nieuw password");
      if (password !== null) {
        updateUserPassword({password});
      }
    }}>verander password</button>
    <br/>
    <hr/>
    <h4>Persoonlijke kalender url:</h4>
    <div className="url-box">{calendarUrl}</div>
    <br />
    <h4>Algemene kalender url:</h4>
    <div className="url-box">{calendarAllUrl}</div>
  </>);
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

function farDateWarning(date: DateTime) {
  let diff = Math.trunc(date.toLocal().diffNow("days").days);
  if (diff < 0 || diff >= 7) {
    if (diff < -1) {
      return `(${-diff} daggen geleden)`;
    } else if (diff < 0) {
      return `(${-diff} dag geleden)`;
    } else {
      return `(Over ${diff} dagen)`;
    }
  }
  return null;
}

function CountsTable({ data }: { data: CountsData }) {
  return (<div className="table-holder">
    <table>
      <thead>
        <tr>
          <th className="table-empty"></th>
          {...data.types.map(t => (<th>
            {t.name}
          </th>))}
        </tr>
      </thead>
      <tbody>
        {...data.users.map(u => (<tr>
          <td>{u.name}</td>
          {...data.types.map(t => (<td>
            {t.counts[u._id] ?? 0}
          </td>))}
        </tr>))}
        <tr className="table-empty-row" aria-hidden="true">
        </tr>
      </tbody>
      <tfoot>
        <tr className="table-important">
          <td>Gemidelde</td>
          {...data.types.map(t => (<td>
            {(t.sum / data.out_of).toFixed(1)}
          </td>))}
        </tr>
      </tfoot>
    </table>
  </div>);
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
  const counts = useQuery(api.func.countsTable, {});
  const slots = useQuery(api.func.slots, {upcoming: false});
  if (slots === undefined || user === undefined || users === undefined || counts === undefined) {
    return <h3>Aan het laden</h3>;
  }

  var rightNow = [];
  var htmlData = [];
  var lastDayString = undefined;

  for (const slot of slots) {
    const { start, end, dayString, fullName } = slotStrings(slot);
    if (lastDayString !== dayString) {
      lastDayString = dayString;
      htmlData.push(<h3 className="day-title">{dayString} {farDateWarning(start)}</h3>);
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
        <select
          onChange={event => {
            event.preventDefault();
            var performer = undefined;
            if (event.target.value !== "") {
              performer = event.target.value as Id<"users">;
            }

            setPerformer({
              slot: slot._id,
              performer,
            })
          }}
          value={slot.performer ?? ""}
        >
          <option value=""></option>
          {...users.map(u => userToOption(u))}
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

  return (<>
    {rightNowHtml}
    <div className="columns-layout">
      <div className="schedule-container small-colum">
      {...htmlData}
      </div>
      <div className="table-column">
        <div>
          <h2>Overzicht</h2>
          <CountsTable data={counts}/>
        </div>
      </div>
    </div>
  </>);
}

function userToOption(user: {_id: Id<"users">, name: string}): ReactElement {
  return (
    <option
      value={user._id}
      key={user._id}
    >
      {user.name}
    </option>
  );
}

function AdminEditSlots() {
  const newUpcomingSlot = useMutation(api.func.newUpcomingSlot);
  const updateUpcomingSlot = useMutation(api.func.updateUpcomingSlot).withOptimisticUpdate((local_store, args) => {
    const slots = local_store.getQuery(api.func.slots, {upcoming: true})?.slice();
    if (slots === undefined) {
      return;
    }
    const idx = slots.findIndex(s => s._id == args.slot);
    if (idx < 0) {
      return;
    }
    var slot = structuredClone(slots[idx]);
    if (args.data.end !== undefined) {
      slot.end = args.data.end;
    }
    if (args.data.start !== undefined) {
      slot.start = args.data.start;
    }
    if (args.data.type !== undefined) {
      slot.type = args.data.type;
    }
    if (args.data.name !== undefined) {
      slot.name = args.data.name;
    }
    if (args.data.showTime !== undefined) {
      slot.showTime = args.data.showTime;
    }
    slots[idx] = slot;
    local_store.setQuery(api.func.slots, {upcoming: true}, slots);
  });
  const deleteUpcomingSlot = useMutation(api.func.deleteUpcomingSlot);
  const rangeEditUpcomingSlos = useMutation(api.func.rangeEditUpcomingSlots);
  
  const types = useQuery(api.func.slotTypes, {});
  const slots = useQuery(api.func.slots, {upcoming: true});
  if (slots === undefined || types === undefined) {
    return <h3>Aan het laden</h3>;
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
        <span>{dayString}</span>
        <div className="day-title-buttons">
          <button onClick={_ => {
            rangeEditUpcomingSlos({
                startRange,
                endRange,
                moveDays: 1,
                action: "copy",
            })
          }}>copier naar volgende dag</button>
          <button onClick={_ => {
            rangeEditUpcomingSlos({
                startRange,
                endRange,
                moveDays: 0,
                action: "delete",
            })
          }}>verwijder dag</button>
        </div>
      </div>);
    }

    function onChange(param: string, type: "dt" | "text" | "id") {
      return (event: ChangeEvent<HTMLInputElement, HTMLInputElement> | ChangeEvent<HTMLSelectElement, HTMLSelectElement>) => {
        var data: Record<string, string | boolean | null> = {};
        var value: string | boolean | null = "";
        if (type === "text") {
          value = event.target.value;
        } else if (type == "dt"){
          value = DateTime.fromISO(event.target.value).toUTC().toISO() as string;
        } else if (type === "id") {
          value = event.target.value || null;
        }
        data[param] = value;
        updateUpcomingSlot({
          slot: slot._id,
          data,
        })
      }
    }

    htmlDataSlots.push(<div key={slot._id} className="slot edit-row">
      <label>
        Naam: 
        <input type="text" onBlur={onChange("name", "text")} defaultValue={slot.name}/>
      </label>
      <label>
        Shift soort: 
        <select onChange={onChange("type", "id")} value={slot.type ?? ""}>
          <option value="">--</option>
          {...types.map(t => <option value={t._id}>{t.name}</option>)}
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
        <input type="checkbox" onChange={e => {
          updateUpcomingSlot({
            slot: slot._id,
            data: {
              showTime: e.target.checked,
            }
          })
        }} checked={slot.showTime}/>
      </label>
      <button onClick={_ => deleteUpcomingSlot({slot: slot._id})}>verwijder</button>
    </div>);
  }
  if (htmlDataSlots.length === 0) {
    htmlDataSlots.push(<div>Nog geen shiften gemaakt</div>);
  }

  return (<>
    <div className="admin-bulk-edit-buttons">
      <button onClick={_ => rangeEditUpcomingSlos({
          startRange: DateTime.fromMillis(0).toUTC().toISO() as string,
          endRange: DateTime.fromObject({year: 5000}).toUTC().toISO() as string,
          moveDays: -7,
          action: "move"
      })}>Verplaats 1 week achteruit</button>
      <button onClick={_ => rangeEditUpcomingSlos({
          startRange: DateTime.fromMillis(0).toUTC().toISO() as string,
          endRange: DateTime.fromObject({year: 5000}).toUTC().toISO() as string,
          moveDays: 7,
          action: "move"
      })}>Verplaats 1 week vooruit</button>
      <button onClick={_ => newUpcomingSlot({})}>Voeg nieuwe shift toe</button>
    </div>
    <div className="schedule-container">
      {...htmlDataSlots}
    </div>
  </>);
}

function AdminEditTypes() {
  const addType = useMutation(api.func.addSlotTypes);
  const updateType = useMutation(api.func.updateSlotTypes);
  const deleteType = useMutation(api.func.deleteSlotTypes);

  const types = useQuery(api.func.slotTypes, {});
  if (types === undefined) {
    return <h3>Aan het laden</h3>;
  }

  var htmlData = [];
  for (const type of types) {
    htmlData.push(<div key={type._id}>
      <input type="text" onBlur={e => updateType({
          name: e.target.value,
          slotType: type._id,
      })} defaultValue={type.name} />
      <span> </span>
      <button onClick={_ => deleteType({slotType: type._id})}>verwijder</button>
    </div>);
  }

  return (<>
    <span>Sift soorten worden gebruikt om de totaal opgenomen siften te bereken. Eén totaal per shift soort per persoon. <strong>Pas op met het verwijderen van een shift soort, all total van die soort gaan dan ook verloren.</strong></span>
    <br/>
    <br/>
    <div className="edit-list">{...htmlData}</div>
    <br/>
    <button onClick={_ => addType()}>Voeg shift toe</button>
  </>);
}

function AdminSetPerformer() {
  const publishUpcoming = useMutation(api.func.publishUpcoming);
  const autoSetPerformerUpcoming= useMutation(api.func.autoSetPerformerUpcoming);
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
  const counts = useQuery(api.func.countsTable);
  const users = useQuery(api.func.users);
  const waitingOnSelection = useQuery(api.func.waitingOnSelection);
  if (slots === undefined || counts === undefined || users === undefined || waitingOnSelection === undefined) {
    return <h3>Aan het laden</h3>;
  }
  const countsWith = structuredClone(counts);

  var htmlData = [];
  var lastDayString = undefined;

  for (const slot of slots) {
    let countIdx = countsWith.types.findIndex(t => t._id === slot.type);
    if (countIdx >= 0 && slot.performer !== undefined) {
      countsWith.types[countIdx].counts[slot.performer] = (countsWith.types[countIdx].counts[slot.performer] ?? 0) + 1;
      if (!(countsWith.users.find(u => u._id === slot.performer)?.assisted ?? true)) {
        countsWith.types[countIdx].sum += 1;
      }
    }

    const { start, dayString, fullName } = slotStrings(slot);
    if (lastDayString !== dayString) {
      lastDayString = dayString;
      htmlData.push(<h3 className="day-title">{dayString} {farDateWarning(start)}</h3>);
    }

    const warn = slot.performer !== undefined
      && slot.not_selected_users.map(u => u._id).includes(slot.performer);

    htmlData.push(<label key={slot._id} className="slot">
        <div>
          <span>{fullName}</span>
          {warn && <div className="warn" title="Deze persoon heeft niet aangeduit dat ze konden op deze shift.">⚠️</div>}
        </div>

        <select
          onChange={event => {
            event.preventDefault();
            var performer = undefined;
            if (event.target.value !== "") {
              performer = event.target.value as Id<"users">;
            }

            setPerformer({
              slot: slot._id,
              performer,
            })
          }}
          value={slot.performer ?? ""}
        >
          <option value=""></option>
          <option disabled>-- kunnen --</option>
          {...slot.selected_users.map(u => userToOption(u))}
          <option disabled>-- kunnen NIET --</option>
          {...slot.not_selected_users.map(u => userToOption(u))}
        </select>
    </label>);
  }
  if (htmlData.length === 0) {
    htmlData.push(<div>Nog geen shiften gemaakt. Gebruik "shifts bewerken" hierboven om er toe te voegen</div>);
  }

  var htmlNotes = [];
  for (const user of users) {
    if (user.note) {
      htmlNotes.push(<li>
        <h3>{user.name}</h3>
        <pre>{user.note}</pre>
      </li>);
    }
  }

  return (<>
    {waitingOnSelection.length > 0 && (
      <div className="waiting-on">
        {waitingOnSelection.length === 1 ?
          (<>{waitingOnSelection.map(u => u.name).join(", ")} moet nog invullen.</>) :
          (<>{waitingOnSelection.map(u => u.name).join(", ")} moeten nog invullen.</>)
        }
      </div>
    )}
    <div className="columns-layout">
      <div className="small-colum">
        <div className="admin-bulk-edit-buttons">
          <button onClick={_ => autoSetPerformerUpcoming({
            replace: true,
          })}>AutoFill™ (alles)</button>
          <button onClick={_ => autoSetPerformerUpcoming({
            replace: false,
          })}>AutoFill™ (enkel lege)</button>
        </div>
        <div className="schedule-container" >
          {...htmlData}
        </div>
        <hr/>
        <button onClick={_ => publishUpcoming({now: DateTime.now().toISO()})} id="publish">Publiceer</button>
      </div>
      <div className="table-column">
        <div>
          {htmlNotes.length > 0 && (<div>
            <h2>Opmerkingen</h2>
            <ul>
              {...htmlNotes}
            </ul>
            <br/>
            <hr/>
          </div>)}
          <div>
            <h2>Overzicht ZONDER volgend schema</h2>
            <CountsTable data={counts}/>
            <hr/>
            <h2>Overzicht MET volgend schema</h2>
            <CountsTable data={countsWith}/>
          </div>
        </div>
      </div>
    </div>
  </>);
}

function AdminEditUsers() {
  const addUser = useMutation(api.func.addUser);
  const updateUser = useMutation(api.func.updateUser);
  const updateUserPassword = useMutation(api.func.updateUserPassword);
  const deleteUser = useMutation(api.func.deleteUser);

  const selfUser = useQuery(api.func.user);
  const users = useQuery(api.func.users);
  if (selfUser === undefined || users === undefined) {
    return <h3>Aan het laden</h3>;
  }

  var htmlData = [];
  for (const user of users) {
    htmlData.push(<div>
      <h3>{user.name}</h3>
      <div key={user._id} className="edit-row">
        <label>
          Omkaderde: 
          <input
            type="checkbox"
            onChange={e => updateUser({
              user: user._id,
              data: {assisted: e.target.checked},
            })}
            checked={user.assisted}
          />
        </label>
        <label>
          Admin: 
          <input
            type="checkbox"
            onChange={e => updateUser({
              user: user._id,
              data: {admin: e.target.checked},
            })}
            disabled={user._id == selfUser._id}
            checked={user.admin}
          />
        </label>
        <button onClick={_ => {
          const password = window.prompt("Nieuw password");
          if (password !== null) {
            updateUserPassword({password});
          }
        }}>verander password</button>
        {user._id == selfUser._id ? <div></div> : <button
          onClick={_ => deleteUser({user: user._id})}
        >verwijder</button>}
      </div>
    </div>);
  }

  return (
    <div>
      <div className="edit-list">
        {...htmlData}
      </div>
      <br/>
      <br/>
      <form
        className="edit-row"
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.target as HTMLFormElement);
          const name = formData.get("name");
          const password = formData.get("password");
          if (name !== null && password !== null) {
            void addUser({name: name.toString(), password: password.toString()})
          }
          (e.target as HTMLFormElement).reset()
        }}
      >
        <input type="text" name="name" required placeholder="Naam" />
        <input type="text" name="password" required placeholder="Password" />
        <button type="submit">Voeg kot genoot toe</button>
      </form>
    </div>
  );
}

function Admin() {
  return (
    <div>
      <nav>
        <NavLink to="/admin" end>Schema</NavLink>
        <NavLink to="/admin/slots" end>Shifts bewerken</NavLink>
        <NavLink to="/admin/users" end>Kot genoten</NavLink>
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
  const setNote = useMutation(api.func.setNote).withOptimisticUpdate((local_store, args) => {
    local_store.setQuery(api.func.note, {}, args.note);
  });

  const slots = useQuery(api.func.slots, {upcoming: true});
  const selectedSlots = useQuery(api.func.selectedSlots, {});
  const counts = useQuery(api.func.countsTable);
  const note = useQuery(api.func.note);
  if (slots === undefined || selectedSlots == undefined || counts == undefined || note === undefined) {
    return <h3>Aan het laden</h3>;
  }
  if (slots.length === 0) {
    return <h3>Geen perma nodig</h3>;
  }

  var htmlData = [];
  var lastDayString = undefined;

  for (const slot of slots) {
    const { start, dayString, fullName } = slotStrings(slot);

    if (lastDayString !== dayString) {
      htmlData.push(<h3 className="day-title">{dayString} {farDateWarning(start)}</h3>);

      lastDayString = dayString;
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

  return (<div className="columns-layout">
    <div className="schedule-container small-colum">
     {...htmlData}
    </div>
    <div className="table-column">
      <div>
        <h2>Opmerkingen</h2>
        <textarea
          className="notes"
          rows={5}
          defaultValue={note ?? undefined}
          onBlur={e => setNote({note: e.target.value})}
          placeholder="Opmerkingen voor de perma verantwoordelijken? Zet ze hier!"
        >
        </textarea>
        <br />
        <br />
        <h2>Overzicht</h2>
        <CountsTable data={counts}/>
      </div>
    </div>
  </div>);
}
