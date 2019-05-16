import env from 'getenv';
import app from './app';

async function main() {
  const port = env.int('PORT', 3000);
  const server = app.listen(port, () => {
    // @ts-ignore
    console.log('Express server listening on port ' + server.address().port);
  });
}

main();
