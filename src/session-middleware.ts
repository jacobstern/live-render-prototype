import session from 'express-session';
import memorystore from 'memorystore';

const MemoryStore = memorystore(session);

export const sessionMiddleware = session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: true,
  store: new MemoryStore({
    checkPeriod: 86400000, // prune expired entries every 24h
  }),
});

export default sessionMiddleware;
