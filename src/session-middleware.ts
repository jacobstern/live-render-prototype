import session from 'express-session';

export const sessionMiddleware = session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: true,
});

export default sessionMiddleware;
