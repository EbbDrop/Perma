# Perma Schedule
This repository contains the code for the Etna Parma scheduling tool. This is an internal tool for
the Etna student housing at KULueven.

> [!NOTE]
> Als ge een etna kot genoot zijt en gewoon het schema wilt gebruiken, het staat op deze website:
> https://etna.ebbdrop.com

## Docs
This project uses [Convex](https://www.convex.dev/) as its backend. The rest of these docs will be
written assuming you are familiar with how Convex works.

### Backend
All backend files can be found in the top level `convex` directory, split up somewhat logically.

### Frontend
The frontend is made using [React](https://react.dev/), its files can be found in the `src`
directory. With `App.tsx` being the main entry point for the React app. CSS is just fully vanilla
css in `src/index.css`.

### Bundling
This project is bundled with [Vite](https://vite.dev/).
To locally test it changes, first run
```bash
npx convex dev
```
and then in a separate window run
```bash
npx vite
```

### Hosting
At the moment the Convex backend is hosted on the convex servers using there free tier. The frontend
is hosted as a Github page. Any change to the main branch will automatically be build and the back
and frontend will be updated.

> [!NOTE]
> Github does not support single page application at change their url at the moment. Currently if a
> user where to reload a page with a path Github will serve a 404 page since it only knows about the
> index.html file in the root. To work around this the
> [spa-github-pages](https://github.com/rafgraph/spa-github-pages) hack by rafgraph is used.

