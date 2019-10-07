# live-render-prototype

Prototype of templates over Socket.IO a la [Phoenix LiveView](https://github.com/phoenixframework/phoenix_live_view).

Updates to the UI are performed by the server and updated on the client over a Socket.IO connection using the same
Handlebars template. For an example of the server code driving UI updates, see [./src/form/live.ts](./src/form/live.ts).
