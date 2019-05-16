import { NextFunction, Request, Response } from 'express';

function precompiledPartials(exhbs: Exphbs) {
  return (req: Request, res: Response, next: NextFunction) => {
    exhbs
      .getPartials({ precompiled: true, cache: req.app.get('view cache') })
      .then(partials => {
        res.locals.precompiledPartials = partials;
        next();
      })
      .catch(next);
  };
}

export default precompiledPartials;
