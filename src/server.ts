import http from 'http';
import env from 'getenv';
import app from './app';
import { useSocketIO } from './io';

async function main() {
  const server = new http.Server(app);
  useSocketIO(server);

  const port = env.int('PORT', 3000);
  server.listen(port, () => {
    console.log('Express server listening on port ' + port);
  });
}

main();
