import compression from 'compression';
import path from 'path';
import express, { NextFunction, Request, Response } from 'express';
import exphbs from 'express-handlebars';
import helmet from 'helmet';
import logger from 'morgan';
import favicon from 'serve-favicon';
import { getStatusText } from 'http-status-codes';
import { StatusError } from './errors';
import counterRoutes from './counter/router';

const app = express();

const env = app.get('env');
app.locals.env = {};
app.locals.env[env] = true;

app.use(favicon(path.resolve(__dirname, '../public/favicon.ico')));
app.use(helmet());
app.use(compression());
app.use(express.urlencoded({ extended: true }));
app.use(logger('dev'));
app.use(express.static(path.resolve(__dirname, '../public')));

app.engine('.hbs', exphbs({ extname: '.hbs' }));
app.set('view engine', '.hbs');

app.use('/', counterRoutes);

app.use((_req, _res, next) => {
  next(new StatusError('Not Found', 404));
});

app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err instanceof StatusError ? err.status : 500;
  const env = req.app.get('env');

  res.status(statusCode).render('error', {
    error: ['development', 'test'].includes(env) ? err : {},
    statusCode,
    statusText: getStatusText(statusCode)
  });
});

export default app;
