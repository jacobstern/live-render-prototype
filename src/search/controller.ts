import express, { Request, Response } from 'express';

export function show(req: Request, res: Response) {
  res.render('search');
}
