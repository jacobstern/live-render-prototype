import Handlebars from 'handlebars/runtime';
import LiveRender from './lib/live-render-client';

const handlebars = Handlebars.create();

const scope = window as Record<string, any>;
Object.keys(scope.application.precompiled).forEach(key => {
  const partial = scope.application.precompiled[key];
  handlebars.registerPartial(key, Handlebars.template(partial));
});

new LiveRender('http://localhost:3000', { handlebars }).connect();
