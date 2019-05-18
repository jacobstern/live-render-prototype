import path from 'path';
import ExpressHandlebars from 'express-handlebars';

export const expressHandlebars = ExpressHandlebars.create({
  defaultLayout: 'main.hbs',
  extname: '.hbs',
  partialsDir: path.resolve(__dirname, '../views/partials'),
});

export default expressHandlebars;
