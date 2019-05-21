import express from 'express';
import { show } from './controller';

const router = express.Router();

router.get('/', show);

export default router;
